# PharmaTrace AI — Phase 1.1 Cross-Tab Transaction Integrity Report

**Project:** `D:\pharmatrace-ai\client\`  
**Reference Defect Review:** `docs/frontend-completion/PHASE_1_CONCURRENCY_REVIEW.md`  
**Status:** Verified & Complete (`37/37` unit/integration tests passing, production Vite build passing, live multi-renderer Chromium E2E suite passing)

---

## 1. Root Cause Recap

Before Phase 1.1, `commitDemoMutation(storage, currentEnvelope, mutator)` in `client/src/services/demoStorage.js` performed a synchronous, unlocked read → revision check → optional rebase → write cycle against `localStorage`:

1. Two browser tabs starting at revision $R$ both passed the `mutator(currentEnvelope.data)` step on stale or identical revision-$R$ snapshots.
2. When Tab A finished writing revision $R+1$ while Tab B was still between `getItem()` and `setItem()`, Tab B never re-checked disk (or evaluated `(diskRev === expectedRev)` as non-conflicting), independently computing the same sequential IDs (`oN`, `prN`, `SHP-XXXX`), setting `revision = R + 1`, and overwriting Tab A's committed write.
3. Both callers returned `{ ok: true }` even though Tab A's record was silently lost.
4. Envelopes carried only a monotonic `revision`, making it impossible for `storage` event listeners in `DemoData.jsx` to distinguish an equal-revision conflicting snapshot from a local write or guard against pre-reset snapshots resurrecting after `resetPersistedDemoData()`.

---

## 2. Chosen Locking & Sync Architecture

### 2.1 Exclusive Cross-Tab Serialization via Web Locks API

All state-mutating operations (`commitDemoMutation` and `resetPersistedDemoData` in `client/src/services/demoStorage.js`) now acquire one application-wide exclusive Web Lock:

- **Lock name:** `DEMO_DATA_LOCK_NAME = 'pharmatrace.demo.data.lock.v1'`
- **Acquisition:** `locks.request(lockName, { mode: 'exclusive' }, async () => { ... })`
- **Strictly Inside the Lock Callback:**
  1. Re-reads persisted state directly from `localStorage` via `loadPersistedDemoData(targetStorage)`.
  2. Executes `await mutator(currentEnvelope.data, currentEnvelope)` against the freshly read snapshot — ensuring sequential IDs (`nextSequentialId`, `nextShipmentRef`, `generateBatchSerials`) and uniqueness/authorization rules operate on committed disk state rather than React's in-memory closure.
  3. Skips disk write and revision bump when `outcome.mutated === false` (e.g., `/verify` lookup of an unknown serial).
  4. Normalizes (`normalizeDemoData`) and validates (`validateAndMigrateDemoData`) the resulting snapshot.
  5. Increments `revision = (currentEnvelope.revision ?? 0) + 1`, assigns a fresh `commitId` (`crypto.randomUUID()` with fallback token), preserves `resetEpoch`, and writes synchronously via `savePersistedDemoData` before releasing the lock.

### 2.2 Envelope Metadata & Cross-Tab `storage` Event Ordering

Every persisted envelope now includes:
- `version`: schema version (`1`)
- `revision`: integer commit counter within the current reset epoch
- `resetEpoch`: integer incremented inside the lock by `resetPersistedDemoData()` (`Math.max(diskEpoch, knownEpoch, 0) + 1`) while resetting `revision: 1`
- `commitId`: unique identifier per committed write

`DemoDataProvider` (`client/src/contexts/DemoData.jsx`) inspects incoming `storage` events (both `event.newValue` and current disk state) using `classifyEnvelopeRelation` / `shouldAdoptStorageEnvelope`:
- Adopts `newer_epoch` or `newer_revision`.
- Ignores `stale_revision` and `stale_epoch` so delayed events or pre-reset snapshots cannot downgrade or resurrect state.
- Flags `conflict` (same `resetEpoch` and same `revision` with differing `commitId`) via `syncConflict` alert state instead of silently treating differing snapshots as identical.

---

## 3. Unsupported-Browser Behavior (`navigator.locks` Unavailable)

If `getWebLocksApi()` detects no `navigator.locks.request`:
- **No unsafe fallback & no fake locks:** Mutations and resets do **not** bypass locking, do **not** fall back to unlocked `localStorage` writes, and do **not** attempt simulated locks over `localStorage` or `BroadcastChannel`.
- **Explicit error refusal:** `commitDemoMutation` and `resetPersistedDemoData` return `{ ok: false, committed: false, code: 'locks_unavailable', error: WEB_LOCKS_UNAVAILABLE_ERROR }`.
- **Readable UI preservation:** `AppShell.jsx`, `Login.jsx`, `Verify.jsx`, and `Report.jsx` render a clear `role="alert"` banner (`locksUnavailableError`) explaining that operational changes are blocked while keeping dashboards, registries, and public verification (`/verify` falling back to read-only `inspectSerial` lookup without writing `verifyCount`) usable and crash-free.

---

## 4. Modified Files & Mutation Interface Changes

### Async Transaction Signature Changes
- **`client/src/services/demoStorage.js`**
  - Removed caller-supplied `currentEnvelope` parameter from `commitDemoMutation(storage, mutator, options)` (reads disk strictly inside `locks.request`).
  - Converted `commitDemoMutation` and `resetPersistedDemoData` to `async` functions returning Promises.
  - Added `DEMO_DATA_LOCK_NAME`, `WEB_LOCKS_UNAVAILABLE_ERROR`, `createCommitId`, `getWebLocksApi`, `isWebLocksSupported`, `classifyEnvelopeRelation`, and `shouldAdoptStorageEnvelope`.
- **`client/src/contexts/DemoData.jsx`**
  - Converted `runTransaction`, `resetDemoData`, `verifyAndRecord` (now executes strictly through `runTransaction`, removing pre-lock `peekPersistedDemoData`), and all exposed mutation helpers to `async`.
  - Added `locksSupported`, `locksUnavailableError`, `syncConflict`, `resetEpoch`, and `commitId` to `DemoData` context; hardened `handleStorage` and wrapped `runTransaction`/`resetDemoData` in `try/catch` to avoid unhandled promise rejections or partial React state updates on error.

### UI Shell & Mutation Callers Updated to `async/await` with Pending/Error Guards
- `client/src/layouts/AppShell.jsx` (renders `!locksSupported` and `syncConflict` alert banners)
- `client/src/features/authentication/Login.jsx` (async `handleResetConfirm`, `resetting` button guard, error surfacing)
- `client/src/features/admin/organizations/Organizations.jsx` (`saving` guard + awaited create/edit/status toggle)
- `client/src/features/admin/users/Users.jsx` (`saving` guard + awaited create/assignment/status toggle)
- `client/src/features/manufacturer/products-batches/ProductsBatches.jsx` (`saving` guard + awaited product/batch/QA release)
- `client/src/features/manufacturer/serialization/Serialization.jsx` (`generating` guard + awaited `generateSerials`)
- `client/src/features/manufacturer/shipments/Shipments.jsx` (`submitting` guard + awaited create/dispatch)
- `client/src/features/distributor/outgoing/Outgoing.jsx` (`submitting` guard + awaited create/dispatch)
- `client/src/features/wholesaler/outgoing/Outgoing.jsx` (`submitting` guard + awaited create/dispatch)
- `client/src/features/distributor/incoming/Incoming.jsx` (awaited session, reconciliation closure, return handover)
- `client/src/features/wholesaler/incoming/Incoming.jsx` (awaited session, reconciliation closure, return handover)
- `client/src/features/pharmacy/incoming/Incoming.jsx` (awaited session, reconciliation closure, return handover)
- `client/src/components/shipments/ReceivingModal.jsx` (`saving` guard + awaited `onSaveSession`)
- `client/src/components/shipments/ShipmentReceivingDrawer.jsx` (`submitting` guard + awaited reconciliation/handover callbacks)
- `client/src/features/pharmacy/verify-dispense/VerifyDispense.jsx` (`dispensing` guard + inline `dispenseErr` alert)
- `client/src/features/investigator/dashboard/Dashboard.jsx` (`submitting` guard + missing error checks fixed on investigation/alert updates)
- `client/src/features/investigator/alerts/Alerts.jsx` (`submitting` guard + error checks fixed on alert/report actions)
- `client/src/features/investigator/investigations/Investigations.jsx` (`submitting` guard + inline error states on create/evidence/notes/status updates)
- `client/src/features/public-verification/verify/Verify.jsx` (`verifying` guard + read-only `inspectSerial` fallback notice when `locks_unavailable`)
- `client/src/features/public-verification/report/Report.jsx` (`submitting` guard + inline error handling without false confirmation state)

### Test Suite Updated
- `client/tests/persistenceAndSession.test.js` (updated all existing tests 1–15 to async lock-backed transactions + added concurrency/integrity tests 16–21)

---

## 5. Verification Results

### 5.1 Node Unit & Integration Test Suite (`npm test`)
Command: `cd D:\pharmatrace-ai\client; npm test`  
Result: **37 / 37 tests passed (`0` failures)** (`duration_ms: ~1027ms`), including:
- **Test 16 (25 paired overlapping async mutations = 50 concurrent writes):** Executed via `Promise.all` with asynchronous yields inside mutators against an exclusive queued Web Locks mock (`maxConcurrentHolders === 1`). **0 lost records**, **0 duplicate IDs**, final `revision === 51`, 50 unique `commitId`s.
- **Test 17 (Overlapping concurrent shipment creations):** 3 concurrent shipment writes racing on `nextShipmentRef` generated 3 distinct `SHP-XXXX` references.
- **Test 18 (Web Locks unavailable):** Mutator skipped, `code === 'locks_unavailable'` returned, `localStorage` and active session left untouched.
- **Test 19 (Delayed & equal-revision conflict storage events):** `stale_revision` and `stale_epoch` rejected (`adopt: false`); equal-revision differing `commitId` classified as `'conflict'`.
- **Test 20 (Reset race):** Pre-reset write, `resetPersistedDemoData()`, and post-reset write queued concurrently; `resetEpoch` incremented to `2`, pre-reset org absent, post-reset org preserved (`revision: 2`), stale pre-reset epoch rejected.
- **Test 21 (Rejected/non-mutating transactions):** Duplicate validation error, thrown exception, and non-mutating lookup left `revision`, `commitId`, and `localStorage` unchanged.

### 5.2 Production Build (`npm run build`)
Command: `cd D:\pharmatrace-ai\client; npm run build`  
Result: **Passed** (`1574 modules transformed`, `dist/assets/index-DFLwuyuG.js 845.18 kB`, exit code `0`).

### 5.3 Live Multi-Renderer Headless Chromium Verification (`verify_phase1_1_e2e.mjs`)
Launched two separate Chromium renderer tabs (`--headless=new --disable-features=ProcessPerSiteUpToMainFrameThreshold`) against `vite preview` over `http://127.0.0.1:4176` with native `navigator.locks` active:

| Scenario | Outcome | Key Measured Evidence |
|---|---|---|
| 25 paired simultaneous UI `Add Organization` submissions across Tab A & Tab B (`50` total mutations) | **PASS** | `0` lost records, `0` duplicate IDs, exact `revision: 51`, persisted across `F5` reload + search |
| Delayed lower-revision `StorageEvent` & equal-revision foreign `commitId` `StorageEvent` | **PASS** | React state preserved at `54` records on stale event; equal-rev foreign `commitId` surfaced `"Conflicting browser storage snapshot detected"` alert |
| Simultaneous reset vs. Tab A mutation + zombie pre-reset `StorageEvent` (`epoch 1, rev 999`) | **PASS** | Lock serialized reset (`resetEpoch: 2`) ahead of queued write (`revision: 2`); zombie epoch-1 event ignored |
| `navigator.locks = undefined` tab (`TabNoLocks`) on `/verify`, `/report`, `/login`, `/admin/organizations` | **PASS** | App stayed readable (`/verify` showed read-only preview), mutations & reset refused with `WEB_LOCKS_UNAVAILABLE_ERROR`, `localStorage` byte-identical |
| Validation error (`Meridian Pharma Ltd (demo)` duplicate), Manufacturer serial generation, Public `/verify` increment | **PASS** | Revision unchanged on rejected submit; serials generated; `verifyCount` incremented cleanly; `0` runtime console/promise errors |

---

## 6. Remaining Temporary Demo Architecture Limitations

1. **Same-Origin Single-Device Scope:** Web Locks + `localStorage` synchronize tabs within one browser profile on one origin. Cross-device persistence, multi-user authentication, and server-side ACID guarantees still await Phase 2 backend/database APIs.
2. **Synchronous Storage Budget:** All operational collections are still serialized into a single `localStorage` key (`pharmatrace.demo.data.v1`); browser storage quota limits apply if thousands of serialized packages are generated in demo mode.
3. **Browser Requirement for Writes:** Environments where Web Locks (`navigator.locks`) is disabled or stripped (e.g., plain HTTP non-localhost origins or legacy embedded webviews) intentionally block mutations rather than risking silent multi-tab overwrites.
