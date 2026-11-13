# PharmaTrace AI — Phase 1 Concurrency Integrity Review

**Date:** 2026-11-13  
**Reviewed Files (Read-Only):**
- `client/src/services/demoStorage.js` (`commitDemoMutation`, `peekPersistedDemoData`, `loadPersistedDemoData`, `savePersistedDemoData`)
- `client/src/services/demoMutations.js` (pure mutator functions & sequential ID generation)
- `client/src/contexts/DemoData.jsx` (`envelopeRef`, `runTransaction`, `verifyAndRecord`, `handleStorage` listener)
- `client/src/contexts/DemoSession.jsx` (`handleStorage` session listener)

---

## Executive Verdict

**`commitDemoMutation()` is NOT atomic and CANNOT guarantee against lost updates under genuinely overlapping multi-tab writes.**

While the current implementation catches **sequential** stale-tab writes (where Tab B commits *after* Tab A has finished writing to `localStorage` and Tab B's `getItem()` observes the higher revision), the `peek → mutator → normalize → setItem` sequence contains an unguarded **Time-of-Check to Time-of-Use (TOCTOU)** window with no cross-tab lock, no Compare-And-Swap (`CAS`), and no unique per-write `commitId`.

Under genuinely overlapping execution between two tabs/processes:
1. Both tabs can read the same base revision (e.g., `revision: 1`), both treat `rebased` as `false`, both compute identical colliding IDs (e.g., `o1`), and both write `revision: 2`.
2. **The first writer's update is silently lost**, and `revision` advances to `2` instead of `3`.
3. **Second-order compounding bug:** Because disk now holds `revision: 2` (from Tab A) while Tab B's React memory also holds `revision: 2`, a subsequent commit from Tab B evaluates `latestOnDisk.revision > baseSource.revision` as `2 > 2` (`false`), **fails to rebase**, and overwrites disk at `revision: 3` with Tab B's diverged branch — wiping Tab A's surviving mutation as well.

---

## 1. Exact Sequence Inspection (`read → revision check → rebase → write`)

From `client/src/contexts/DemoData.jsx:60-68` and `client/src/services/demoStorage.js:334-364`:

1. **Read React ref (`DemoData.jsx:62`):**  
   `runTransaction` passes `envelopeRef.current` as `currentEnvelope` into `commitDemoMutation(storage, envelopeRef.current, mutator)`.
2. **Read `localStorage` (`demoStorage.js:336`):**  
   `const latestOnDisk = peekPersistedDemoData(storage)` calls `target.getItem(DEMO_DATA_STORAGE_KEY)`, runs `JSON.parse`, and validates/normalizes schema v1 (`demoStorage.js:288-299`).
3. **Revision comparison (`demoStorage.js:337-338`):**
   ```js
   const rebased = Boolean(latestOnDisk && latestOnDisk.revision > (baseSource.revision ?? 0))
   const baseEnvelope = rebased ? latestOnDisk : baseSource
   ```
4. **Compute mutation (`demoStorage.js:340-348`):**  
   `const outcome = mutator(baseEnvelope.data)` invokes functions in `demoMutations.js` (including authorization checks, business validations, `nextSequentialId`, `nextShipmentRef`, and `generateBatchSerials`), returning `{ ok, nextData, result }`.
5. **Normalize & construct envelope (`demoStorage.js:350-355`):**  
   Assigns `revision: (baseEnvelope.revision ?? 0) + 1`, `updatedAt`, and runs `normalizeDemoData(outcome.nextData)`.
6. **Write `localStorage` (`demoStorage.js:357`):**  
   `savePersistedDemoData(storage, nextEnvelope)` calls `target.setItem(DEMO_DATA_STORAGE_KEY, JSON.stringify(nextEnvelope))`.
7. **Update React memory (`DemoData.jsx:63-66`):**  
   If `committed.rebased || committed.ok`, updates `envelopeRef.current = committed.envelope` and schedules `setEnvelope(committed.envelope)`.

**Why `verifyAndRecord` (`DemoData.jsx:108-137`) has an additional pre-check:**  
Lines `112-123` call `peekPersistedDemoData(storage)` to determine whether `rawSerial` exists (so non-existent serials skip committing a transaction), potentially mutating `envelopeRef.current` and calling `setEnvelope`, and only then invoke `runTransaction(...)` at line `134`, repeating `peek → mutate → setItem`.

---

## 2. Can Two Tabs Read the Same Revision and Both Commit Different Updates?

**Yes.** Web Storage (`window.localStorage`) provides synchronous `getItem()` and `setItem()` APIs with **no transaction boundary, no atomic Compare-And-Swap, and no cross-process lock**.

Suppose Tab A and Tab B are backed by separate OS renderer processes (or any multi-process / async-cache storage execution such as Firefox E10s, Safari multi-tab processes, Chrome tabs in separate BrowsingInstances, or IPC propagation lag between Chromium renderer caches and the Browser StorageService):

| Time | Tab A | Tab B | `localStorage` State |
| :--- | :--- | :--- | :--- |
| `t0` | Calls `peekPersistedDemoData()` → reads **`rev: 1`** | — | `rev: 1`, orgs: `[m1, d1, w1, p1]` |
| `t1` | Inside `mutator` (`nextSequentialId` picks `o1`) | Calls `peekPersistedDemoData()` → reads **`rev: 1`** (`rebased = false`) | `rev: 1`, orgs: `[m1, d1, w1, p1]` |
| `t2` | Writes `setItem` (`rev: 2`, `o1: OrgA`) | Inside `mutator` (`nextSequentialId` also picks `o1`) | `rev: 2`, orgs: `[..., o1: OrgA]` |
| `t3` | `envelopeRef.current = rev: 2` (`OrgA`) | Writes `setItem` (`rev: 2`, `o1: OrgB`) | **`rev: 2`, orgs: `[..., o1: OrgB]` (`OrgA` LOST)** |
| `t4` | `runTransaction` adds `OrgA2`: sees disk `rev: 2 > mem rev: 2` is **`false`**! Does **NOT** rebase! Writes **`rev: 3`** (`OrgA`, `OrgA2`) | — | **`rev: 3`, orgs: `[..., OrgA, OrgA2]` (`OrgB` ALSO WIPED)** |

Even if `Tab A` and `Tab B` only execute step `t0..t3`, **one update is permanently lost and both writers believe their commit succeeded at `revision: 2`**.

---

## 3. Delayed `storage` Event Behavior (`DemoData.jsx:49-58`)

From `client/src/contexts/DemoData.jsx:49-58`:

```js
useEffect(() => {
  function handleStorage(e) {
    if (e.key !== DEMO_DATA_STORAGE_KEY && e.key !== null) return
    const loaded = loadPersistedDemoData()
    envelopeRef.current = loaded.envelope
    setEnvelope(loaded.envelope)
  }
  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}, [])
```

**Scenario:** Tab A commits `revision: 2` at `t0`. The browser queues an async `storage` event (`e.newValue` = `rev 2`) for Tab B. Before Tab B drains that event, Tab B commits `revision: 3` at `t1` (setting `envelopeRef.current` to `rev 3` and `localStorage` to `rev 3`). At `t2`, the delayed `storage` event from `t0` executes `handleStorage` in Tab B.

**Observed behavior & defects:**
1. **Mitigating factor:** Because `handleStorage` ignores `e.newValue` and calls `loadPersistedDemoData()` (which reads current `localStorage` via `getItem`), reading disk at `t2` reads `rev 3` rather than rolling back React state to `e.newValue`'s `rev 2` — *provided* no other tab overwrote `localStorage` with a lower revision in the interim.
2. **Actual defect — missing monotonicity / divergence guard:** `handleStorage` unconditionally sets `envelopeRef.current = loaded.envelope` and calls `setEnvelope(loaded.envelope)`:
   - Even when `loaded.envelope.revision === envelopeRef.current.revision`, it causes redundant state replacements and re-renders.
   - If another tab overwrote `localStorage` with a split-brain or stale snapshot whose revision is `<=` Tab B's current `envelopeRef.current.revision`, `handleStorage` blindly **downgrades** Tab B's in-memory `envelopeRef.current` instead of detecting divergence (except when an explicit reset/clear reduced revision back to `1`).
   - Meanwhile, `DemoSession.jsx:40-47` reloads `loadPersistedSession()` on session key changes, which is appropriate for single-session browser preview switching.

---

## 4. Test Methodology & Actual Results

Two complementary tests were executed without modifying application code:

### 4.1 Deterministic Overlapping-Execution Test (`scratch/test_interleave.mjs`)
Directly imported the real `commitDemoMutation`, `loadPersistedDemoData`, `peekPersistedDemoData`, and `mutateAddOrganization` against a shared storage store instrumented to trigger `Tab B`'s `commitDemoMutation` strictly *inside* `Tab A`'s `peekPersistedDemoData()` call (before `Tab A` reached `savePersistedDemoData()`), followed by a second commit from `Tab B`.

**Actual Output:**
```text
=== Overlapping Write Simulation Result ===
Tab B commit ok: true revision written: 2 rebased: false
Tab A commit ok: true revision written: 2 rebased: false
Disk final revision: 2
Disk org names: [
  'm1:Meridian Pharma Ltd (demo)',
  'd1:Corridor Distribution (demo)',
  'w1:Riverside Wholesale (demo)',
  'p1:Greenleaf Pharmacy (demo)',
  'o1:Tab A Overlapping Org'
]
Tab B org survived on disk? false
Tab A org survived on disk? true
--- After Tab B second commit (base rev=2 vs disk rev=2) ---
Tab B 2nd rebased? false new rev: 3
Disk orgs: [
  'm1:Meridian Pharma Ltd (demo)',
  'd1:Corridor Distribution (demo)',
  'w1:Riverside Wholesale (demo)',
  'p1:Greenleaf Pharmacy (demo)',
  'o1:Tab B Overlapping Org',
  'o2:Tab B Second Org'
]
```

- **Confirmed:** Under overlapping execution, **Tab B's `Org` was lost**, both tabs received `ok: true` with `revision: 2` and duplicate `o1`, and **Tab B's subsequent commit failed to rebase (`2 > 2` → `false`), wiping Tab A's surviving org cleanly off disk**.

### 4.2 Real Multi-Tab Headless Chromium Tests (`scratch/test_concurrency.mjs`, `scratch/test_two_renderers.mjs`)
Executed 10 paired clock-aligned simultaneous `Add Organization` UI submissions across two Chromium tabs (`tA`, `tB`) pointing at `vite preview` (`127.0.0.1`), plus a 5-round busy-loop `getItem → 3ms work → setItem` probe.

**Actual Output (`test_concurrency.mjs`):**
```json
{
  "roundsPerTab": 10,
  "expectedTotalOrgs": 24,
  "actualTotalOrgs": 24,
  "expectedRevision": 21,
  "actualRevision": 21,
  "lostFromA": [],
  "lostFromB": [],
  "duplicateOrgIds": [],
  "storageRevsSeenByA": [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  "storageRevsSeenByB": [3, 5, 7, 9, 11, 13, 15, 17, 19, 21]
}
```

**Why Chrome passed those 10 rounds without making `commitDemoMutation` safe:**  
In modern Chromium on desktop, two tabs opened to the same origin (`127.0.0.1`) share a single `SiteInstance` renderer process and V8 main thread (even with `--process-per-tab`), so synchronous JavaScript execution turns inside `commitDemoMutation` could not preempt one another on that single V8 thread (`storageRevsSeenByA` strictly interleaved even revisions `[2,4,...,20]` while B saw `[3,5,...,21]`).  
However, **this is a runtime coincidence of Chrome's single-renderer-per-origin policy, NOT an application-level atomicity guarantee**:
- Browsers that run two tabs in separate OS renderer processes (multi-process navigation isolation, separate `SiteInstance`s, Firefox E10s, Safari WebKit content processes) maintain per-renderer DOMStorage caches updated over async IPC, recreating the exact TOCTOU interleaving proven in Section 4.1.
- Any async step introduced inside or prior to `commitDemoMutation` immediately opens the same race even inside a single renderer process.

---

## 5. Summary Against Review Criteria

| Question | Verdict |
| :--- | :--- |
| Is `commitDemoMutation()` atomic? | **No.** `getItem → mutator → setItem` has an unguarded TOCTOU window and no cross-tab lock or CAS. |
| Can two tabs read the same revision and both commit different updates? | **Yes**, whenever execution overlaps between `peekPersistedDemoData()` and `savePersistedDemoData()` across separate processes or async steps. |
| Do both distinct mutations survive and revisions stay consistent under overlap? | **No.** One mutation is silently lost, both commits report `revision: 2` / identical `o1`, and a follow-up commit can trigger `2 === 2` rebase blindness, wiping the other tab's surviving commit too. |
| Can delayed `storage` events revert newer committed state? | Reading disk (`loadPersistedDemoData()`) avoids reverting to `e.newValue`, **but** lacking a monotonic `(revision, commitId)` guard in `handleStorage` means disk regression or stale writes can still downgrade `envelopeRef.current` silently. |

---

## 6. Recommended Smallest Reliable Correction (Not Yet Applied)

To make concurrency integrity reliable within this temporary frontend-only architecture without introducing a backend or heavy libraries:

### Recommended Approach (Two Complementary Parts)

1. **Add per-commit `commitId` + monotonic & reset-aware guard (small change in `demoStorage.js` + `DemoData.jsx`):**
   - Include a unique `commitId` (e.g., `crypto.randomUUID?.() ?? ...`) and `resetCounter` (or `epoch`) on every persisted envelope.
   - Update `commitDemoMutation()` divergence detection from:
     ```js
     latestOnDisk.revision > baseSource.revision
     ```
     to detect **same-revision divergence** as well:
     ```js
     const diverged = Boolean(
       latestOnDisk &&
       (latestOnDisk.revision > (baseSource.revision ?? 0) ||
         (latestOnDisk.revision === (baseSource.revision ?? 0) &&
           latestOnDisk.commitId !== baseSource.commitId))
     )
     ```
     This permanently fixes the second-order `2 === 2` non-rebase bug.
   - Update `handleStorage` in `DemoData.jsx` to ignore stale/equal commits (`loaded.revision < current.revision`, unless `resetEpoch` increased or storage was cleared `e.newValue === null`).

2. **Eliminate the cross-process TOCTOU window cleanly:**
   - **Option B1 (Web Locks + IndexedDB — truly atomic across browser processes):** Persist the single demo envelope in a tiny `IndexedDB` object store (whose read-modify-write transaction is guaranteed ACID and serialized across *all* tabs/processes by the browser engine) *or* guard mutations with `navigator.locks.request('pharmatrace.demo.tx', ...)` paired with a `BroadcastChannel` latest-envelope state bus (eliminating cross-renderer `localStorage` cache lag). This requires updating portal handlers to `await` mutation calls (async transaction API), while keeping pure `commitDemoMutation` available for Node unit tests.
   - **Option B2 (Minimum zero-UI-refactor mitigation if calls must stay synchronous):** Combine Part 1 (`commitId` + `resetEpoch` + `handleStorage` monotonic guard) with an **optimistic verify-after-write check** in `commitDemoMutation` (if `peekPersistedDemoData()` returns a different `commitId` at a newer/equal revision right after `setItem`, warn/retry up to `N` attempts) plus explicitly documenting the residual microsecond multi-renderer `localStorage` limitation until backend or async IndexedDB storage replaces `demoStorage.js`.

**Recommendation:** Adopt **Part 1 immediately** alongside **Option B1 (`navigator.locks` + `IndexedDB` or `BroadcastChannel` state sync)** if true cross-process concurrency safety is required before backend integration; if synchronous mutation signatures must be preserved for Phase 1 portals, adopt **Part 1 + explicit verify-after-write retry** and document the single-browser `localStorage` boundary explicitly.
