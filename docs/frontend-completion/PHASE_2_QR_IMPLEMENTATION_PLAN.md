# PharmaTrace AI — Phase 2 QR Generation & Scanning Implementation Plan

**Project:** `D:\pharmatrace-ai` (`client/`)  
**Phase:** Phase 2 — Readiness Assessment & Implementation Plan (Inspection Only)  
**Date:** 2026-11-13  
**Scope:** Read-only assessment of existing serialization, scanning, verification, dependencies, label/print readiness, and downstream scanner integration. No application source code was modified and no packages were installed during this assessment.

---

## Classification Legend

- **`VERIFIED`**: Confirmed directly in source code (`D:\pharmatrace-ai\client\`) and consistent with current behavior.
- **`PARTIALLY IMPLEMENTED`**: Present and working for serial strings, but missing QR encoding/decoding, URL payload parsing, or label/print workflows.
- **`MISSING`**: Not implemented in the codebase or dependencies.
- **`UNVERIFIED`**: Present in code paths that cannot be exercised end-to-end without physical hardware or manual browser runtime checks (specifically live physical webcam `getUserMedia` QR decoding and physical thermal/A4 printer output).

---

## 1. Existing Serialization Architecture

**Overall Status:** `VERIFIED` for persistent text serial generation; `PARTIALLY IMPLEMENTED` for package labeling (no QR artifacts exist yet).

### Answers to Inspection Questions

1. **How package serial numbers are generated:** `VERIFIED`
   - `formatSerial(batchNo, n)` in `client/src/data/fixtures/index.js` (line 26) formats serials deterministically as `` `DEMO-${batchNo}-${String(n).padStart(5, '0')}` `` (for example, `DEMO-PCM-2601-00023`).
   - `generateBatchSerials({ batch, quantity, packages, date, manufacturerOrgId })` in `client/src/services/serialization.js` (lines 13–98) validates:
     - Batch exists (`!batch`).
     - Batch QA status is `'Released'` (`batch.release !== 'Released'`, line 20).
     - `quantity` is a positive integer (`Number.isInteger(n) && n >= 1`, lines 27–35).
     - Requested quantity fits within remaining batch capacity (`batch.quantity - batchPackages.length`, lines 37–44).
   - It determines `maxExisting` via `parseSerialIndex(p.serial, batch.no)` (lines 5–11, 47–50), allocates sequentially from `maxExisting + 1`, and falls back to scanning indices `1..batch.quantity` to fill gaps safely (lines 53–91).
   - UI entry point: `client/src/features/manufacturer/serialization/Serialization.jsx` calls `useDemoData().generateSerials({ batchId, quantity: qty })` (line 52), which commits `mutateGenerateSerials` (`client/src/services/demoMutations.js`, lines 20–58) through `commitDemoMutation` in `DemoData.jsx`.

2. **How uniqueness is enforced:** `VERIFIED`
   - Inside `generateBatchSerials()` (`serialization.js`, line 46), `const existingSerials = new Set(packages.map(p => p.serial))` checks every candidate against all packages in state (across all batches and manufacturers).
   - When invoked via `generateSerials`, `mutateGenerateSerials` runs inside the exclusive Web Lock (`navigator.locks.request('pharmatrace.demo.data.lock.v1', ...)` in `demoStorage.js`), re-reading the latest persisted snapshot from `localStorage` before generating serials so simultaneous browser tabs cannot allocate identical serial indices or lose records.

3. **How manufacturer organization ownership is assigned:** `VERIFIED`
   - `mutateGenerateSerials` (`demoMutations.js`, lines 21–47) authorizes `['manufacturer']` via `authorizeActorForRole`, resolves `ownerOrgId = batch.orgId ?? product?.orgId ?? 'm1'`, rejects batches belonging to another manufacturer (`auth.orgId && ownerOrgId !== auth.orgId`), verifies the manufacturer organization exists, has `type === 'Manufacturer'`, and is `active`.
   - Each created package object records `manufacturerOrgId: ownerOrgId`, `custodian: ownerOrgId`, and initial custody event `['Package serialized', ownerOrgId, date ?? batch.mfd]` (`serialization.js`, lines 59–68).
   - `Serialization.jsx` (lines 11–19) scopes visible batches and packages to the active session's `orgId`.

4. **How package identity is stored:** `VERIFIED`
   - Packages are normalized objects stored in `data.packages` (`serialization.js`, lines 59–68; `fixtures/index.js`, lines 28–36):
     ```js
     {
       serial,              // Primary key, e.g. 'DEMO-PCM-2601-00023'
       batchId,             // Reference to batches[].id
       manufacturerOrgId,   // Manufacturer org ID
       status,              // 'available' | 'in_transit' | 'accepted' | 'quarantined' | 'dispensed' | 'rejected' | 'missing'
       custodian,           // Current org ID holding custody
       history,             // Array of [eventLabel, orgId, isoDate]
       verifyCount,         // Integer count of recorded public verification checks
       shipmentRef          // Active or last shipment reference, or null
     }
     ```
   - No QR payload string, image data URL, or print-count field is stored on the package object. Because `serial` is immutable and globally unique, QR payloads and rendered graphics can be derived deterministically from `pkg.serial` (plus display metadata looked up from `batch` and `product`) without bloating `localStorage` with cached SVG/PNG blobs.

5. **Whether serialized packages can be selected for shipment:** `VERIFIED`
   - In `client/src/features/manufacturer/shipments/Shipments.jsx` (lines 76–101), `eligibleItems` filters `packages` where `pkg.custodian === orgId` using `validatePackageForDispatch()` (`client/src/services/supplyChain.js`, lines 30–103).
   - Newly serialized packages have `status: 'available'`, `custodian: orgId`, `shipmentRef: null`, and belong to a `Released` batch; unless the batch is expired (`batch.exp < today`), they appear immediately in `OutgoingEligibilityList` and can be toggled or scanned via `QrScanner` into `selectedSerials`.

6. **Whether serial generation survives refresh:** `VERIFIED`
   - `mutateGenerateSerials` commits via `commitDemoMutation` into `localStorage['pharmatrace.demo.data.v1']` (normalized and versioned with `schemaVersion`, `revision`, and `commitId`). Reloading the browser restores all generated packages (`client/tests/persistenceAndSession.test.js` and Phase 1.1 Chromium E2E verification).

7. **Whether duplicate generation is prevented:** `VERIFIED`
   - Prevented across both single-tab double-clicks (`generating` lock state in `Serialization.jsx`, lines 27, 48, 108) and multi-tab concurrent clicks (Web Lock serialization in `demoStorage.js` + `existingSerials` check + remaining batch quantity check in `generateBatchSerials`).
   - Note on existing fixtures (`fixtures/index.js`, lines 28–36): seed helper `mk(...)` omits `manufacturerOrgId` (using `'m1'` in `history[0]`), while `Serialization.jsx` line 17 still includes them via `orgBatchIds.has(p.batchId) || p.manufacturerOrgId === orgId`. This works for all existing and newly created packages.

---

## 2. Existing Scanner Architecture

**Overall Status:** `PARTIALLY IMPLEMENTED` (UI and manual/camera wrappers exist; URL payload decoding does not).

### Answers to Inspection Questions

1. **Where `QrScanner` lives:** `VERIFIED`
   - Actual file path: **`client/src/components/scanner/QrScanner.jsx`** (lines 1–197). *(Note: It is in `components/scanner/`, not `components/qr/`.)*

2. **Which screens use `QrScanner`:** `VERIFIED`
   - Exhaustive check across `client/src/` confirms **7 active consumer files** (covering all supply-chain stages plus investigation):
     1. **Manufacturer Outgoing Shipments:** `client/src/features/manufacturer/shipments/Shipments.jsx` (line 377 → `handleScanPackage`, line 151)
     2. **Distributor Outgoing Shipments:** `client/src/features/distributor/outgoing/Outgoing.jsx` (line 419 → `handleScanPackage`, line 152)
     3. **Wholesaler Outgoing Shipments:** `client/src/features/wholesaler/outgoing/Outgoing.jsx` (line 346 → `handleScanAdd`, line 140)
     4. **Shared Incoming Receiving Modal (Distributor, Wholesaler, Pharmacy Incoming portals):** `client/src/components/shipments/ReceivingModal.jsx` (line 270 → `handleScan`, line 80)
     5. **Pharmacy Verify & Dispense:** `client/src/features/pharmacy/verify-dispense/VerifyDispense.jsx` (line 111 → `handleLookup`, line 27)
     6. **Public Verification (`/verify`):** `client/src/features/public-verification/verify/Verify.jsx` (line 122 → `runVerify`, line 33)
     7. **Investigator Traceability Search:** `client/src/features/investigator/search/Search.jsx` (line 172 → `handleScan`, line 90)

3. **How scanning decodes payloads:** `VERIFIED`
   - `QrScanner.jsx` instantiates `new Html5Qrcode(readerId)` (`html5-qrcode@^2.3.8`, line 82) with `{ facingMode: 'environment' }` and `{ fps: 10, qrbox: { width: 220, height: 220 } }` (lines 85–87).
   - On decode, it trims the raw text (`String(decodedText ?? '').trim()`), applies a `1500ms` same-text debounce (`SCAN_DEBOUNCE_MS`, lines 6, 91–98), and calls `onScanRef.current?.(trimmed)` verbatim.
   - Manual `<form>` entry (`handleSubmit`, lines 120–127) also trims input (`value.trim()`) and invokes `onScan?.(trimmed)`.
   - Neither `QrScanner.jsx` nor any downstream handler parses URLs, query parameters, path segments, GS1 Digital Link URIs, or structured QR payloads.

4. **Whether camera scanning vs manual entry works:**
   - **Manual entry:** `VERIFIED` across all 7 consumers.
   - **Camera teardown/error handling in source:** `VERIFIED` in source (`requestAnimationFrame` container visibility wait on line 78; `NotAllowedError` / `NotFoundError` formatting in lines 8–17; `mountedRef` + `stopCamera()` unmount cleanup on lines 41–70).
   - **Live camera decoding (`Html5Qrcode.start`):** `UNVERIFIED` end-to-end. No live physical camera or synthetic video stream test was executed in Playwright/headless Chromium, and `navigator.mediaDevices.getUserMedia` requires a secure context (`localhost` or `https://`).

5. **What formats downstream handlers expect:** `VERIFIED`
   - Every downstream consumer assumes raw `DEMO-...` serial strings via `.trim().toUpperCase()`:
     - `Verify.jsx` line 37 & `mutateVerifyAndRecord` line 61 & `verifySerial` (`verification.js`, line 71)
     - `Results.jsx` (`useParams().serial`, lines 17–22)
     - `VerifyDispense.jsx` line 28 & `mutateDispensePackage` line 551
     - `ReceivingModal.jsx` line 82 & `applyReceivingSession` (`supplyChain.js`, line 318)
     - `Shipments.jsx` line 152, `distributor/outgoing/Outgoing.jsx` line 153, `wholesaler/outgoing/Outgoing.jsx` line 141
     - `investigator/search/Search.jsx` line 94

6. **How `verifySerial`, `verifyAndRecord`, `ReceivingModal`, `Shipments`, and `VerifyDispense` handle scanned input:** `VERIFIED`
   - **`Verify.jsx` / `verifyAndRecord`:** Records `+1` to `pkg.verifyCount` via Web Lock (only when the serial exists) and returns `verifySerial(...)` result (`verified`, `invalid`, `expired`, `quarantined`, `dispensed`, `unshipped`, `incomplete`, plus `unusualActivity` flag when `verifyCount > 2`).
   - **`Results.jsx` (`/verify/results/:serial`):** Calls `inspectSerial(serial)` (`DemoData.jsx` → `verifySerial` without mutation). Deliberately read-only so page refreshes do not inflate `verifyCount`.
   - **`Verify.jsx` query params:** Currently ignores `?serial=...` URL query parameters completely (`useState('')` at line 26; no `useSearchParams()`). Notice `Report.jsx` (lines 16–20) *does* read `searchParams.get('serial')`, whereas `Verify.jsx` does not.
   - **`ReceivingModal.jsx` (`handleScan`):** Checks manifest membership (`manifest.includes(serial)`), logs non-manifest or unknown scans to `unmatchedThisSession`, rejects duplicates in `scannedThisSession` and already-locked dispositions (`accepted`, `damaged`, `rejected` from prior sessions), and stages matched scans into `sessionDraft` (`status: 'accepted'`). Custody never changes until explicit click on **Save Receiving Session** (`applyReceivingSession` via Web Lock).
   - **`Shipments.jsx` & `Outgoing.jsx`:** Checks `checkBySerial.get(serial)` / `validatePackageForDispatch()` to block non-custody, quarantined, dispensed, expired, unreleased, or already-allocated serials; adding a scan only updates `selectedSerials` in modal state (does not create/dispatch shipment automatically).
   - **`VerifyDispense.jsx`:** Scanning updates `selectedSerial`, runs `verifySerial` + `validatePackageForDispense`; **Confirm Dispense** button stays disabled unless eligible and requires explicit click.
   - **`Search.jsx`:** Sets search query to scanned string and opens `Drawer` only if an exact package match exists (`packages.find(p => p.serial.toUpperCase() === scanned.trim().toUpperCase())`).

7. **What happens if a QR code contains a verification URL instead of a plain serial:** `VERIFIED` (**Current Blocker**)
   - **All 7 scanner consumers + `verifySerial` currently fail** when given a URL such as `https://pharmatrace.example/verify?serial=DEMO-PCM-2601-00023` or `http://localhost:5173/verify/results/DEMO-PCM-2601-00023`.
   - Instead of extracting `DEMO-PCM-2601-00023`, handlers pass `"HTTPS://.../VERIFY?SERIAL=DEMO-PCM-2601-00023"` directly to exact-equality lookup (`p.serial === serial`):
     - Public `/verify`: Displays `Invalid` ("This identifier could not be found in the registry").
     - Pharmacy Verify & Dispense: Displays `Invalid` / blocks dispense.
     - Incoming `ReceivingModal`: Rejects the legitimate package and logs the entire uppercase URL as an `"Unknown serial ... — Logged as unmatched"`.
     - Manufacturer/Distributor/Wholesaler Outgoing: Reports `"Serial ... was not found"`.
     - Investigator Search: Matches zero packages because `serial` does not include the full URL prefix.

---

## 3. Missing Functionality

| Capability | Status | Details & Location |
|---|---|---|
| Real QR code image generation (SVG / Canvas / PNG) | `MISSING` | No QR encoding library in `client/package.json`; `Serialization.jsx` renders text serials only. |
| Manufacturer label preview UI | `MISSING` | `Serialization.jsx` Drawer (`lines 161–187`) shows text `<dl>` metadata and custody timeline with no visual label or QR graphic. |
| Individual QR / label download (PNG & SVG) | `MISSING` | No download action per serialized package (nor on Manufacturer Shipment manifests). |
| Batch label sheet generation & download | `MISSING` | No batch-level or selection-based multi-label grid sheet export/preview. |
| Print layout (`@media print` / printable label sheet) | `MISSING` | `client/src/index.css` has zero `@media print` / `@page` rules; printing currently captures `AppShell` sidebar/navigation and clipped tables. |
| Shared QR payload builder & URL-tolerant parser | `MISSING` | No utility builds canonical verification URLs or extracts package `serial` from URLs/query strings/path routes/plain serials. |
| `/verify?serial=...` auto-prepopulate / lookup handling | `MISSING` | `Verify.jsx` does not read `?serial=` query params on load (unlike `Report.jsx`). |
| QR label printing tests & end-to-end QR decode tests | `MISSING` | Existing `tests/serialization.test.js` and `tests/verification.test.js` cover string serials only. |

---

## 4. Proposed QR Payload Format & Resolution Rules

### 4.1 Recommended Primary QR Payload Format

Encode a clean **public verification URL** whose sole identifying token is the existing canonical package serial:

```text
<appOrigin>/verify?serial=<SERIAL>
```

Example using the active SPA origin (from `window.location.origin` in browser, falling back cleanly if invoked outside DOM):

```text
https://pharmatrace.example/verify?serial=DEMO-PCM-2601-00023
```

**Why `/verify?serial=<SERIAL>` is recommended over `/verify/results/<SERIAL>` as the primary encoded URL (while supporting both on decode):**
1. **Clean single-step consumer & pharmacist UX:**
   - External phone cameras opening `<origin>/verify?serial=DEMO-PCM-2601-00023` land on `Verify.jsx`, which can auto-display the read-only lookup (`inspectSerial(serial)`) immediately or provide a one-tap **Run Recorded Check** / `verifyAndRecord` without double-counting page refreshes on every reload (`F5` / bookmark). *(Option: run read-only lookup on initial `?serial=` query mount and show a clearly labeled "Record verification check" button, OR trigger a single in-memory session guard — detailed below so `verifyCount` does not accidentally trigger false `unusualActivity` alerts on browser refresh!)*
   - By contrast, `/verify/results/:serial` (`Results.jsx` line 19) is strictly read-only and has no scanner or manual re-entry bar. However, both URL patterns remain 100% supported by `parseQrPayload()`.
2. **Low QR density for tiny medicine cartons:**
   - At ~48–60 characters (`https://<host>/verify?serial=DEMO-PCM-2601-00023`), QR Version 3–4 (`29×29` to `33×33` modules) at ECC Level `M` scans reliably even at **18–22 mm** label widths on smartphone cameras and standard 200–300 DPI label printers.
3. **Router & Base-URL safety:**
   - `Verify.jsx` already exists at `/verify` (`router.jsx`, line 83), matching how `Report.jsx` already uses `/report?serial=...` (`Verify.jsx` line 224).

### 4.2 Security, Privacy & Regulatory Wording Constraints

- **No confidential or mutable supply-chain data inside the QR payload:** The QR payload MUST contain **only** the public verification route + `serial` (`DEMO-...`). It MUST NOT embed `orgId`, customer/patient details, operator identities, batch release/quarantine flags, internal `custodian`, `history`, or full medicine JSON records. All product, batch, custody, and dispensing statuses remain resolved from authoritative application state (`data.packages`, `data.batches`, `data.products`).
- **Clinical integrity notice:** Label previews, Verification pages, and manufacturer QR documentation MUST continue to treat the QR code as an **identifier lookup mechanism**, not standalone proof (preserving the `verification.js` rule and clinical wording: *QR verification alone does not prove medicine authenticity*).

### 4.3 Canonical Serialization & Shared `parseQrPayload()` Contract

Create a dedicated pure module `client/src/services/qrPayload.js` usable in both Vite browser bundles and `node --test`:

- `buildVerificationUrl(serial, origin)`:
  - Trims & uppercases `serial`.
  - Uses normalized origin (stripped trailing `/`) + `/verify?serial=${encodeURIComponent(canonicalSerial)}`.
  - If no `origin` is provided (e.g., SSR/unit test without `window`), falls back to relative `/verify?serial=...` or explicit test base URL.
- `parseQrPayload(rawInput)`:
  - Never throws on arbitrary strings, whitespace, control chars, or malformed URLs.
  - Accepts and normalizes (case-insensitive routing, uppercase serial):
    1. **Plain serial string** (`DEMO-PCM-2601-00023` or custom valid package identifier token `[A-Z0-9][A-Z0-9_-]*`) → `{ ok: true, serial: 'DEMO-PCM-2601-00023', sourceType: 'serial' }`.
    2. **Full verification URL or relative path with query param** (`https://any-host/verify?serial=DEMO-...`, `/verify?serial=DEMO-...`, or `http://localhost:5173/report?serial=DEMO-...`) → extracts `searchParams.get('serial')` → `{ ok: true, serial, sourceType: 'url_query' }`.
    3. **Verification results path URL** (`https://any-host/verify/results/DEMO-PCM-2601-00023` or `/verify/results/DEMO-PCM-2601-00023`) → extracts final path segment (`decodeURIComponent`) → `{ ok: true, serial, sourceType: 'url_path' }`.
    4. **Hash-routed fallback** (`https://any-host/#/verify?serial=...` or `/#/verify/results/...`) → parses hash route cleanly for static hosts if ever used.
    5. **Non-matching URL / garbage / empty payload** (e.g. `https://evil.example/phish`, `""`, `"hello world"`) → `{ ok: false, serial: '', reason: 'QR code does not contain a valid PharmaTrace package serial or verification URL.' }`.
  - **Backward Compatibility Guarantee:** Legacy plain-serial inputs (`DEMO-PCM-2601-00031`), lowercase manual inputs (`demo-pcm-2601-00031`), copied URLs from browser address bars, and newly generated QR verification URLs ALL resolve to the exact same `DEMO-PCM-2601-00031` string.

---

## 5. Manufacturer QR Generation Workflow

**Goal:** Seamless extension of `client/src/features/manufacturer/serialization/Serialization.jsx` while preserving all Clinical Integrity styling, QA release gates, Web Lock persistence, and multi-manufacturer organization isolation (`orgId`).

### End-to-End Flow

1. **QA-Released Batch Selection & Serial Generation (Existing + Unchanged Rules):**
   - Manufacturer selects a batch in `Serialization.jsx` (line 72). Batches with `release !== 'Released'` remain blocked from serialization (`line 112`, `serialization.js` line 20).
   - Clicking **Generate serials** runs `generateSerials({ batchId, quantity: qty })` atomically inside the Web Lock and persists the new packages to `localStorage`.
   - **Immediate Actionability:** Upon success, `Serialization.jsx` updates the toast and optionally highlights the newly generated batch/packages with a direct action button: **"Print / Export Latest Labels (N)"**.
2. **Retroactive + Newly Generated Coverage in `orgPackages` Table:**
   - Every serialized package belonging to `orgId` (both pre-existing seed/persisted packages and newly created packages) automatically has a QR code derived on demand from its `serial`.
   - **Table enhancements (`Serialization.jsx`, lines 150–159):**
     - Add multi-select checkboxes on rows + **"Select all filtered"** / **"Select current batch"** controls (scoped strictly to `orgBatches` / `orgPackages`).
     - Keep row click opening the Package Details `Drawer` (`lines 161–187`) plus an explicit inline **"Label / QR"** action button per row (`e.stopPropagation()`) that opens the label preview directly.
3. **Package Details `Drawer` Label Preview (`Serialization.jsx`, lines 161–187):**
   - Inside the existing Package Details Drawer, render a **Package Label Preview** card displaying:
     - Crisp SVG QR code (encoding `<origin>/verify?serial=<serial>`).
     - Human-readable metadata strictly beside (never overlapping) the QR code:
       - Product Name + Strength + Form/Pack Size (e.g., `Paracetamol 500 mg · Tablet · 10 x 10`)
       - Batch No (`PCM-2601`)
       - Manufactured (`MFD`) & Expiry (`EXP`) dates
       - Manufacturer Organization name (`orgName(sel.manufacturerOrgId ?? bi?.orgId ?? orgId)`)
       - Monospace Serial (`DEMO-PCM-2601-00023` via `.id-text`)
       - Compact clinical notice: *"Scan to inspect recorded journey. QR alone does not prove authenticity."*
     - Action buttons:
       - **Download PNG** (high-resolution PNG label card with QR + metadata, or QR-only SVG/PNG toggle)
       - **Download SVG** (lossless vector QR/label)
       - **Print Label** (triggers print sheet for this single package)
       - **Copy Verification URL** (helpful for QA / testing downstream scanning without physical camera)
4. **Batch / Selected Label Sheet Modal & Print Workflow:**
   - Top toolbar in `Serialization.jsx` provides:
     - **Export Selected / Batch Labels** button (opens `LabelSheetModal` with selected serials, or all packages in the filtered batch with a sensible safety cap warning if > 200 items, or pagination/chunking per print sheet).
     - Allows choosing between:
       - **Print Sheet (`window.print()`)** — renders clean A4/Letter grid sheet in print portal outside `#root` layout chrome (or `@media print` isolation).
       - **Download Batch Sheet (SVG / Printable HTML / High-DPI PNG Strip)** — self-contained downloadable batch label sheet containing all selected labels arranged in a crisp grid so labels can be archived or printed offline without server dependencies.

---

## 6. Label Preview, Download & Printing Design

To make generated QR labels genuinely scannable by mobile cameras and `html5-qrcode`, layout geometry and print CSS must obey ISO/IEC 18004 scan ergonomics:

### 6.1 Physical Dimensions & Quiet Zones
- **QR Module Quiet Zone:** Minimum **4 modules** of solid `#FFFFFF` margin on all four sides (`margin: 4` in `qrcode` options). Zero colored backgrounds, drop shadows, watermarks, rounded corner clipping over modules, or overlay icons/logos inside the QR matrix.
- **QR Foreground / Background Contrast:** Pure black `#000000` modules on pure white `#FFFFFF` background (do NOT use `navy` `#0F2A4A` or low-contrast slate for QR modules in print, to maximize infrared/low-light camera contrast).
- **Error Correction Level:** `M` (`15%` recovery) by default, or `Q` (`25%`) where module count stays compact (`<= Version 4`). With a ~50-char URL (`https://<host>/verify?serial=DEMO-PCM-2601-00023`), ECC `M` produces an uncrowded `33×33` grid easily readable at small sizes.
- **Individual Unit Label Card Size (Screen Preview & Single Print):**
  - Recommended target footprint: **`70mm × 40mm`** (standard carton label; crisp `26mm × 26mm` QR block on left + `~40mm` right column for Product Name/Strength, `BATCH`, `MFD` / `EXP`, `SERIAL`, and `Verify at /verify` hint). Minimum allowed QR block: **`22mm × 22mm`**.
- **Batch A4 Print Sheet Grid:**
  - `@page { size: A4 portrait; margin: 10mm; }`
  - Usable printable width: `190mm`; usable height: `277mm`.
  - **2 columns × 6 rows (`12 labels per A4 page`)** or **3 columns × 7 rows (`21 labels per A4 page`, `~61mm × 37mm` per cell with `3mm` gap)**:
    - Recommend **3 × 7 (`60mm × 36mm` cells, `3mm` gap, `21mm × 21mm` QR inside each cell)** or **2 × 6 (`92mm × 42mm` cells, `4mm` gap, `26mm × 26mm` QR)** — **`2 × 5` or `2 × 6` (`92mm × 42mm` / `92mm × 48mm`)** is safer across both A4 (`210×297mm`) and US Letter (`215.9×279.4mm`) without overflow, clipping, or micro-font crowding!
    - Apply `break-inside: avoid; page-break-inside: avoid;` on every `.pt-label-card` and natural page breaks between pages so no QR label is ever split across a page boundary.

### 6.2 Download Formats & Export Quality
- **Individual Label PNG (`300 DPI` equivalent):** Generated onto an offscreen `<canvas>` at high scale (`~840 × 480 px` for a `70×40mm` label card, with crisp QR rendered via `QRCode.toCanvas` at `>= 300×300 px` with `imageSmoothingEnabled = false`) and exported via `canvas.toBlob(..., 'image/png')` (`PharmaTrace-Label-<SERIAL>.png`). Guaranteed pixel-sharp modules for desktop/phone testing and thermal print drivers.
- **Individual Label SVG:** Self-contained `<svg>` (`viewBox` in millimeters or pixels) combining `<g>` vector QR paths (`QRCode.toString(..., { type: 'svg' })`) + crisp `<text>` metadata beside it (`PharmaTrace-Label-<SERIAL>.svg`). Infinitely sharp at any DPI.
- **Batch Label Sheet Download:**
  - **Printable Multi-Label SVG / Standalone HTML Print Sheet (`PharmaTrace-Labels-<BATCH>.html` or `.svg`):** A clean, zero-dependency, self-contained HTML sheet (with embedded inline vector SVGs and `@media print` `@page` rules) **plus** optional high-res composite PNG sheet download for small batches (e.g., `<= 24` labels per image). Multi-page HTML print sheets handle 100+ labels reliably without browser `<canvas>` memory limits (`MAX_CANVAS_AREA`).

### 6.3 Print Isolation Architecture (`client/src/index.css`)
- Currently `AppShell` renders a persistent `w-64` dark navy sidebar and top bar (`client/src/layouts/AppShell.jsx`). Without print CSS, `window.print()` prints the sidebar, filter bars, and modals.
- **Planned approach:** Render the active print sheet inside a dedicated container (`#pt-print-root` or `[data-print-sheet="true"]`) and add `@media print` rules in `client/src/index.css`:
  - Hide `#root` (or `.no-print` / `AppShell` chrome) when printing a dedicated React Portal (`#pt-print-root` appended directly under `<body>`), OR mark non-print chrome `print:hidden` and reset `body { background: #fff; }` and `* { print-color-adjust: exact; -webkit-print-color-adjust: exact; }`.
  - Using a sibling portal container (`#pt-print-root`, hidden on screen via `@media screen { #pt-print-root { display: none; } }`, visible on `@media print { #root { display: none !important; } #pt-print-root { display: block !important; } }`) is dramatically cleaner and avoids fighting `Modal` `overflow-hidden`, `fixed inset-0`, `max-h-[90vh]`, and `AppShell` flex wrappers during print pagination!

---

## 7. Downstream Scanner Integration Plan

### 7.1 Centralized Normalization Strategy
Do **not** duplicate regex/URL parsing logic in 7 separate feature components. Instead:
1. Add `parseQrPayload(raw)` in `client/src/services/qrPayload.js`.
2. Update `client/src/components/scanner/QrScanner.jsx`:
   - Add a prop `normalizePayload = true` (default `true`, with optional `allowPartial = false` for Investigator free-text search if desired — wait: if Investigator scans a URL QR, extracting the serial makes exact + table filtering work immediately, while plain batch/shipment terms like `PCM-2601` or `SHP-0001` are also valid single tokens!).
   - When `Html5Qrcode` or manual submit fires, run `parseQrPayload(trimmed)`:
     - If `parsed.ok`: pass `parsed.serial` cleanly to `onScan(parsed.serial)` (and optionally pass metadata as 2nd arg `onScan(parsed.serial, parsed)` for zero breaking changes).
     - If `!parsed.ok`: display inline accessible `role="alert"` error inside `QrScanner.jsx` (*"Unrecognized QR format. Scan a valid PharmaTrace package QR or enter a serial number."*) without forwarding malformed garbage URLs into `unmatchedScans` or mutating state — **or** allow `onInvalidScan?.(raw, parsed.reason)` callback if a receiving operator deliberately wants feedback when scanning a wrong/external barcode! Wait: think carefully about **Receiving**: if someone scans a non-PharmaTrace external box barcode or counterfeit bogus QR into `ReceivingModal`, what should happen?
       - If the scanned QR is a **validly structured serial or PharmaTrace verification URL** whose serial is unknown or off-manifest (e.g. `.../verify?serial=DEMO-FAKE-99999` or `FAKE-123`), `parseQrPayload` extracts `DEMO-FAKE-99999` / `FAKE-123` (`ok: true`) and `ReceivingModal` logs it into `unmatchedThisSession` as expected!
       - If the scanned QR is an arbitrary unrelated HTTP URL (e.g. `https://example.com/promo`), `parseQrPayload` returns `{ ok: false, reason }` and displays a clear invalid-QR error message **instead of crashing or polluting `unmatchedScans` with an external URL**.
3. **Also normalize in service & handler entry points (Defense in Depth):**
   - Call `extractSerial(raw)` (using `parseQrPayload` fallback) inside:
     - `verifySerial(raw, ...)` (`client/src/services/verification.js`)
     - `mutateVerifyAndRecord(data, raw)` (`client/src/services/demoMutations.js`)
     - `ReceivingModal.jsx` (`handleScan`), `Shipments.jsx` (`handleScanPackage`), `distributor/outgoing/Outgoing.jsx` (`handleScanPackage`), `wholesaler/outgoing/Outgoing.jsx` (`handleScanAdd`), `VerifyDispense.jsx` (`handleLookup`), `Search.jsx` (`handleScan`), and `Verify.jsx` (`runVerify`).
   - That guarantees pasting a copied QR verification URL directly into *any* input (not just scanning via camera) resolves cleanly to the same package serial.

### 7.2 Portal-by-Portal Integration Matrix

| Portal / Screen | File | Behavior After Phase 2 Integration | Custody / State Transfer on Scan Alone? |
|---|---|---|---|
| **Public Verification (`/verify`)** | `features/public-verification/verify/Verify.jsx` | Reads `?serial=` query param via `useSearchParams()`. When a user opens `/verify?serial=DEMO-...` via mobile QR camera, auto-resolves the package via read-only `inspectSerial(serial)` immediately and offers an explicit **"Record Verification Check"** button (plus camera/manual submits call `verifyAndRecord`) — OR runs `verifyAndRecord` once per distinct URL navigation via ref guard so browser refresh/double-render does not double-increment `verifyCount`. Displays invalid-format feedback cleanly if `?serial=` or scanned URL is malformed. Preserves `unusualActivity` & *"not proof of counterfeiting"* clinical wording. | **No custody change.** (`verifyCount` increments only on verification check action.) |
| **Public Verification Results (`/verify/results/:serial`)** | `features/public-verification/results/Results.jsx` | Accepts URL-encoded serial param, normalizes via `parseQrPayload` if URL-like, renders full read-only result (`inspectSerial`). | **No.** Strictly read-only. |
| **Manufacturer Outgoing** | `features/manufacturer/shipments/Shipments.jsx` | Scanning a generated QR URL extracts `serial`, validates `custodian === orgId`, active batch/QA release, not expired, not already allocated/quarantined/dispensed, and adds to `selectedSerials`. | **No.** Adds to shipment draft selection only; requires **Create shipment** + **Dispatch**. |
| **Distributor Incoming** | `features/distributor/incoming/Incoming.jsx` + `components/shipments/ReceivingModal.jsx` | Scanning URL QR matches manifest `serial` (normalized uppercase), marks `accepted` in `sessionDraft` if unlocked, warns on session duplicates (`scannedThisSession`) or prior-session locks (`accepted`, `damaged`, `rejected`), and records unknown/off-manifest serials cleanly in `unmatchedThisSession`. | **No.** Requires explicit **Save Receiving Session** click (`applyReceivingSession`). |
| **Distributor Outgoing** | `features/distributor/outgoing/Outgoing.jsx` | Same QR URL extraction → `validatePackageForDispatch()` against distributor custody (`pkg.custodian === orgId`, `status === 'accepted'`). Blocks damaged/quarantined/already-allocated packs. | **No.** Requires **Create Shipment** + **Confirm Dispatch**. |
| **Wholesaler Incoming** | `features/wholesaler/incoming/Incoming.jsx` + `ReceivingModal.jsx` | Shared `ReceivingModal` integration identical to Distributor Incoming. | **No.** Requires explicit **Save Receiving Session**. |
| **Wholesaler Outgoing** | `features/wholesaler/outgoing/Outgoing.jsx` | Same QR URL extraction → `validatePackageForDispatch()` against wholesaler custody before creating pharmacy shipment. | **No.** Requires **Create Shipment** + **Confirm Dispatch**. |
| **Pharmacy Incoming** | `features/pharmacy/incoming/Incoming.jsx` + `ReceivingModal.jsx` | Shared `ReceivingModal` integration; supports partial receiving & discrepancy quarantine/rejection reconciliation across sessions. | **No.** Requires explicit **Save Receiving Session**. |
| **Pharmacy Verify & Dispense** | `features/pharmacy/verify-dispense/VerifyDispense.jsx` | Scanning URL QR populates `selectedSerial` and runs full 5-point inspection (Authenticity, Supply-chain status, Dispensing status, Expiry, Pharmacy custody) via `verifySerial` + `validatePackageForDispense`. Blocks if already dispensed, expired, quarantined, wrong pharmacy custody, or incomplete traceability. | **No.** Requires explicit **Confirm Dispense** button click. |
| **Investigator Search** | `features/investigator/search/Search.jsx` | Scanning URL QR extracts `serial`, populates search input/query, shows matching package/batch/shipment rows, and opens Package Custody Details `Drawer` for exact match. | **No.** Read-only investigation. |

---

## 8. Recommended Dependencies

*(No packages were installed during this read-only phase.)*

### Primary Recommendation: `qrcode` (`^1.5.4`)

| Criterion | Assessment |
|---|---|
| **Compatibility** | Pure JavaScript (ESM/CJS), works seamlessly with **React `18.3.1`**, **Vite `5.3.1`**, existing **`html5-qrcode@^2.3.8`**, and **Node `node --test`** (for unit-testing generated SVG/data URLs directly without DOM/JSDOM hacks). |
| **Bundle & Maintenance** | Zero native bindings, tiny footprint (~35 KB minified), battle-tested ISO/IEC 18004 encoder (`dijkstrajs` + standard reed-solomon). |
| **SVG + Canvas + PNG Support** | Natively provides `QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 })` (lossless crisp SVG for screen labels, `@media print`, SVG downloads, and HTML print sheets) AND `QRCode.toDataURL(...)` / `QRCode.toCanvas(...)` (high-resolution raster PNG label export). |
| **Print / Batch Sheets** | Combines with CSS `@media print` `@page` rules and self-contained downloadable HTML/SVG label sheets without adding bloated PDF engines (`jspdf` ~300+ KB or `pdfkit`). |

**Alternative Considered & Rejected:**
- `qrcode.react`: Wraps QR rendering only as React JSX `<svg>`/`<canvas>`, which is awkward for standalone batch SVG/HTML file downloads, pure JS export utilities, and `node --test` unit tests without React DOM mounting. Wrapping `qrcode` in a small `<QrCodeSvg />` React component + `qrGenerator.js` service gives full control over both React UI and offline file exports with one dependency.

**Dev/Test Optional Consideration (for Automated E2E QR Round-Trip Verification):**
- `html5-qrcode` already exposes `Html5Qrcode.scanFile(file, false)` inside the browser, which can decode generated PNG files during headless Playwright E2E verification without adding a separate scanner dependency! Optionally, `jsqr` (pure JS devDependency) could verify decoded pixel buffers directly inside Node tests if desired (`UNVERIFIED` until Phase 2 testing decides whether `Html5Qrcode.scanFile` + `jsqr` devDependency is preferable).

---

## 9. Files Likely to Be Created or Modified

### Planned New Files (`client/`)
| File | Purpose |
|---|---|
| `client/src/services/qrPayload.js` | `buildVerificationUrl(serial, origin)`, `parseQrPayload(raw)`, `extractSerial(raw)` canonical normalization & validation. |
| `client/src/services/qrGenerator.js` | Pure/DOM helpers wrapping `qrcode`: `generateQrSvgString`, `buildLabelSvgString`, `exportLabelPngBlob`, `buildBatchLabelSheetHtml`, safe filename helpers, download triggers. |
| `client/src/components/qr/QrCodeSvg.jsx` | Reusable Clinical Integrity QR preview component (high-contrast `#000`/`#FFF`, `margin: 4`, accessible `aria-label` + error fallback). |
| `client/src/components/qr/PackageLabelCard.jsx` | Standardized `70×40mm`-proportioned visual & printable label card (QR + Product, Strength, Batch, MFD, EXP, Manufacturer, Serial, clinical disclaimer). |
| `client/src/components/qr/LabelSheetModal.jsx` | Modal for previewing batch/selected label sheets, choosing download format (PNG / SVG / Print Sheet HTML), and triggering `#pt-print-root` browser print. |
| `client/tests/qrPayloadAndLabels.test.js` | Unit tests covering payload encoding/decoding, URL tolerance, rejection of unrelated/malformed QR inputs, SVG generation, metadata escaping, and batch label HTML generation. |

### Planned Modified Files (`client/`)
| File | Scope of Change |
|---|---|
| `client/package.json` & `client/package-lock.json` | Add `"qrcode": "^1.5.4"` after user approval. |
| `client/src/index.css` | Add `@media screen` / `@media print` `@page` rules, `#pt-print-root` isolation, `.pt-label-grid`, `.pt-label-card { break-inside: avoid; }`, and `print-color-adjust: exact`. |
| `client/src/features/manufacturer/serialization/Serialization.jsx` | Add row checkboxes & selection bar, inline `Label / QR` trigger, Package Label preview + Download PNG/SVG/Print buttons inside `Drawer`, Batch Print/Export modal trigger, and post-generation quick-export banner. |
| `client/src/components/scanner/QrScanner.jsx` | Normalize camera + manual payloads via `parseQrPayload()`, display inline invalid-QR feedback when malformed, clean `aria` error state. |
| `client/src/services/verification.js` & `client/src/services/demoMutations.js` | Normalize incoming `rawSerial` inputs via `extractSerial()` inside `verifySerial`, `mutateVerifyAndRecord`, and `mutateDispensePackage` (defense in depth). |
| `client/src/features/public-verification/verify/Verify.jsx` | Read `?serial=` search param via `useSearchParams()`, auto-populate/verify cleanly without StrictMode/refresh double-counting, use `parseQrPayload` error messaging on bad scans. |
| `client/src/features/public-verification/results/Results.jsx` | Normalize route param via `extractSerial()` cleanly. |
| `client/src/components/shipments/ReceivingModal.jsx` | Use `parseQrPayload()` in `handleScan` + clear error feedback for invalid non-PharmaTrace URLs vs unknown/off-manifest serials. |
| `client/src/features/manufacturer/shipments/Shipments.jsx` | Normalize scanned/entered input in `handleScanPackage` via `parseQrPayload()`. |
| `client/src/features/distributor/outgoing/Outgoing.jsx` | Normalize scanned/entered input in `handleScanPackage` via `parseQrPayload()`. |
| `client/src/features/wholesaler/outgoing/Outgoing.jsx` | Normalize scanned/entered input in `handleScanAdd` via `parseQrPayload()`. |
| `client/src/features/pharmacy/verify-dispense/VerifyDispense.jsx` | Normalize scanned/entered input in `handleLookup` via `parseQrPayload()`. |
| `client/src/features/investigator/search/Search.jsx` | Normalize QR scan via `parseQrPayload()` in `handleScan` so scanning a URL opens matching serial & Package Custody Drawer directly. |

---

## 10. Test & Acceptance Criteria

### 10.1 Automated Unit & Integration Tests (`npm test` / `node --test`)
1. **QR Payload Builder & Parser (`qrPayload.js`):**
   - `buildVerificationUrl('demo-pcm-2601-00023', 'https://app.test')` → `'https://app.test/verify?serial=DEMO-PCM-2601-00023'`.
   - `parseQrPayload` extracts identical `'DEMO-PCM-2601-00023'` from:
     - Full URL with `?serial=...` (any origin, HTTP/HTTPS, mixed case)
     - `/verify/results/DEMO-PCM-2601-00023`
     - Relative `/verify?serial=DEMO-PCM-2601-00023`
     - URL-encoded or extra query params (`?utm_source=scan&serial=...`)
     - Plain serial (`DEMO-PCM-2601-00023` and `demo-pcm-2601-00023`)
   - Rejects (`ok: false`) empty strings, arbitrary unrelated URLs (`https://example.org/login`), script injection strings, and invalid characters safely without exceptions.
2. **QR Image & Label Generator (`qrGenerator.js`):**
   - Generates valid SVG XML (`<svg ...>`) containing dark modules on white quiet zone (`margin >= 4`) for every generated package serial.
   - Generates printable batch label sheet HTML containing product name/strength, batch number, MFD/EXP, manufacturer name, serial, SVG QR, and `@media print` CSS with XML/HTML entity escaping (preventing XSS from custom product/org names).
3. **Existing & Regression Tests (`tests/*.test.js`):**
   - All 37 existing unit tests continue passing (`serialization`, `supplyChain`, `verification`, `persistenceAndSession`).
   - `mutateVerifyAndRecord` and `verifySerial` resolve both plain serials and verification URLs identically.

### 10.2 Build & Headless Browser E2E Acceptance Criteria
1. **`npm run build` (`vite build`)** completes with zero warnings/errors.
2. **Manufacturer Serialization & Label Workflow:**
   - Generate new serials for a QA-released batch → reload page → serials persist and still show QR previews (`SVG` element non-zero bounding box).
   - Blocked QA-pending batch still cannot generate serials/QR labels.
   - Export individual PNG (non-empty `image/png` blob > 0 bytes), individual SVG, and batch sheet HTML download.
   - Trigger print preview state (`emulateMedia({ media: 'print' })` in Playwright) → verify `#pt-print-root` labels are visible with `@page` sizing and `AppShell` sidebar/header are hidden.
3. **Genuine QR Round-Trip Across Entire Supply Chain (Browser Canvas / `Html5Qrcode.scanFile`):**
   - Decode the actual PNG exported from Manufacturer `Serialization.jsx` back into a string using `Html5Qrcode.scanFile` (verifying the encoded QR image itself carries `<origin>/verify?serial=<SERIAL>` and is machine-readable!).
   - Feed that **exact decoded URL payload** through all downstream portals without manual stripping:
     1. Manufacturer `Shipments` → scan URL → creates & dispatches shipment (`custodian` remains `'m1'` until accepted).
     2. Distributor `Incoming` (`ReceivingModal`) → scan URL → marks `accepted` → duplicate scan blocked → Save Receiving Session transfers custody to Distributor (`d1`).
     3. Distributor `Outgoing` → scan URL → creates & dispatches to Wholesaler (`w1`).
     4. Wholesaler `Incoming` → scan URL → saves receiving session (`w1`).
     5. Wholesaler `Outgoing` → scan URL → creates & dispatches to Pharmacy (`p1`).
     6. Pharmacy `Incoming` → scan URL → saves receiving session (`p1`).
     7. Pharmacy `Verify & Dispense` → scan URL → shows Eligible → explicit **Confirm Dispense** transitions package to `dispensed` → re-scan blocks second dispense.
     8. Public `/verify?serial=<SERIAL>` direct URL navigation & public `/verify` QR URL paste → displays `dispensed` / complete simplified journey and increments check count only cleanly once.
     9. Investigator `Search` → scan URL → surfaces matching package & opens custody drawer.
4. **Live Physical Camera Limitation Transparency:**
   - Live physical webcam hardware scanning must be clearly reported as manual verification or `UNVERIFIED` if running solely in headless CI without physical camera/fake-video flags (`--use-fake-device-for-media-stream`).

---

## 11. Risks, Limitations & Compatibility Issues

1. **`verifyCount` Double-Increment Risk on `/verify?serial=...` Navigation:**
   - *Risk:* In React 18 StrictMode (`main.jsx`), `useEffect` fires twice in dev, and users frequently refresh verification tabs. Automatically calling `verifyAndRecord` inside a bare `useEffect` on `/verify?serial=...` could trigger duplicate increments (`verifyCount = 2` → `3` `"Unusual verification"` false alarm!).
   - *Mitigation:* On `/verify?serial=...` URL entry, populate input `v`, show instant read-only `inspectSerial(serial)` lookup (matching `Results.jsx` semantics), and either record via an explicit user click (`Verify`) OR guard auto-check once per explicit scan event/location state so page reloads never inflate `verifyCount`.
2. **SPA Direct URL Navigation on Static Hosts (`/verify?serial=...`):**
   - *Risk:* Scanning a QR code with a phone's native camera opens `https://<host>/verify?serial=...` directly from the OS browser. Production static hosts (Vercel/Netlify/Nginx/GitHub Pages) MUST have SPA fallback routing configured to serve `index.html` for `/verify` (Vite dev/preview already does this, `vite.config.js` has no custom `base`).
3. **Browser Camera `getUserMedia` Constraints (`html5-qrcode`):**
   - *Risk:* Browsers block camera access on non-HTTPS origins (except `http://localhost` / `http://127.0.0.1`). Testing from another phone over LAN IP `http://192.168.x.x:5173` fails unless served over HTTPS or localhost port-forwarding. Manual serial/URL paste in `QrScanner.jsx` must remain always visible as first-class fallback.
4. **Large Batch Print / Export Memory Limits:**
   - *Risk:* Generating hundreds of high-DPI PNG canvases simultaneously or attaching 500 SVG `<path>` elements inside one React Drawer could freeze the UI.
   - *Mitigation:* Paginate / cap on-screen preview sheets cleanly (e.g., render selected batch up to 60–100 labels per preview sheet with slice controls), generate individual PNG/SVG lazily on click, and stream multi-page HTML sheets for large batches.
5. **Browser Print Headers/Footers & Scale Settings:**
   - *Risk:* Users who have browser "Fit to page width" or non-100% print scale can alter exact millimeter label dimensions; thermal label printers (`50×30mm`) vs A4 laser sheets (`210×297mm`) require slightly different margins.
   - *Mitigation:* Provide a clear preset toggle (**A4 Label Sheet (2×6)** vs **Single Thermal Carton Label (70×40mm)**) in the print modal plus explicit `@page` dimensions.
6. **Non-GS1 Illustrative Identifiers:**
   - Serials (`DEMO-PCM-2601-00023`) and GTINs (`DEMO-GTIN-0001`) are illustrative demo identifiers, not GS1-compliant `(01)/(21)` Digital Link URIs. UI copy and docs must keep this frontend demo boundary explicit.
