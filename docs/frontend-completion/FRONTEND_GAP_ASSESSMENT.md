# PharmaTrace AI — Frontend Completion Gap Assessment

**Assessment Date:** 2026-11-13  
**Project Root:** `D:\pharmatrace-ai`  
**Frontend Root:** `D:\pharmatrace-ai\client`  
**Assessment Mode:** Strict read-only inspection (no application code, tests, dependencies, or prior audit documents modified)

---

## Classification Legend

Every capability and finding in this report uses one of the following classifications:

- **VERIFIED** — Behavior or defect directly observed in source code and/or executed tests.
- **PARTIALLY IMPLEMENTED** — UI or core logic exists in part, but critical functional, persistence, cross-portal, or workflow requirements remain incomplete.
- **MISSING** — Required capability is absent from the codebase.
- **UNVERIFIED** — Behavior could not be definitively validated at runtime with automated browser/camera/persistence execution under current read-only test tooling.

---

## 1. Executive Summary

### Overall Functional Verdict: **NOT COMPLETE (FAILS FULL FRONTEND COMPLETION CRITERIA)**

While Phase 1 and Phase 1 acceptance remediation established clean routing across 24 operational portal screens, 3 public verification routes, and 3 authentication preview routes—alongside pure-JS domain logic backed by 24/24 passing `node:test` unit tests—the PharmaTrace AI frontend is **not functionally complete** for realistic end-to-end multi-portal demonstration or pre-backend handoff.

Three structural blockers prevent the frontend from functioning as a coherent multi-session, end-to-end pharmaceutical traceability platform:

1. **Zero State & Session Persistence (`MISSING`):** Both `DemoSessionProvider` (`client/src/contexts/DemoSession.jsx:4`) and `DemoDataProvider` (`client/src/contexts/DemoData.jsx`) hold all state exclusively in volatile React `useState` hooks. Any browser refresh (`F5`), tab close, or direct reload clears the active role (redirecting back to `/login`) and discards all user-created products, batches, serials, shipments, receiving sessions, dispenses, alerts, cases, organizations, and users.
2. **Missing Manufacturer QR Code Generation, Preview, Export & Printing (`MISSING`):** `client/package.json` includes `html5-qrcode` (scanner only) and has no QR generation library or custom QR encoder. `Serialization.jsx` generates sequential text strings (`DEMO-<batchNo>-<00001>`) only—it cannot render scannable QR graphics, preview package labels, export QR images (`PNG`/`SVG`), or print label sheets for downstream camera scanning.
3. **Hardcoded Single-Organization Tenant Scoping (`PARTIALLY IMPLEMENTED` / Architectural Defect):** Although Admin (`Organizations.jsx`, `Users.jsx`) can create new Distributor, Wholesaler, Pharmacy, and Manufacturer organizations and dispatch dropdowns include them, every operational portal hardcodes one seed organization ID (`'m1'`, `'d1'`, `'w1'`, `'p1'`). Switching roles never lets a user act as any newly onboarded organization, stranding shipments dispatched to new organizations.

Additional verified gaps include frozen static investigator alerts (no automatic leads generated from high `verifyCount`, receiving discrepancies, or expired stock), hardcoded `'2026-11-12'` dates in two Investigator views, non-persistent local-only `Register`/`ForgotPassword` forms, missing filter/metric parity across dashboards and shipment tabs, and zero React UI/DOM integration or persistence test coverage.

---

## 2. Current Frontend Architecture

**Status:** **VERIFIED**

| Layer | File(s) | Technology / Responsibility |
|---|---|---|
| Entry & Build | `client/package.json`, `client/src/main.jsx` | React `^18.3.1`, React Router DOM `^6.26.0`, Vite `^5.3.1`, Tailwind CSS `^3.4.4`, `lucide-react`, `recharts`, `html5-qrcode` |
| Root Providers | `client/src/app/App.jsx:6-14` | Wraps `RouterProvider` inside `<DemoSessionProvider>` and `<DemoDataProvider>` |
| Routing | `client/src/app/router.jsx:41-99` | `createBrowserRouter` mapping 6 auth/public routes + 24 `AppShell`-guarded portal routes + `/access-denied` + `*` |
| Navigation Config | `client/src/constants/navigation.js` | Static `ROLES` metadata (`label`, default static `org`, nav items + icons) for all 6 authenticated roles |
| Layout Guard | `client/src/layouts/AppShell.jsx:6-17` | Enforces `role` presence (`<Navigate to="/login" replace />`) and exact role match (`<Navigate to="/access-denied" replace />`) |
| Global State | `client/src/contexts/DemoSession.jsx`, `client/src/contexts/DemoData.jsx` | Volatile in-memory role state (`role`) and 9 in-memory domain collections seeded from fixtures |
| Domain Services | `client/src/services/serialization.js`, `supplyChain.js`, `verification.js` | Pure deterministic helper functions for serial generation, shipment dispatch/receiving/reconciliation/inventory eligibility, and public verification evaluation |
| Demo Fixtures | `client/src/data/fixtures/index.js` | Seed arrays for `ORGS`, `USERS`, `PRODUCTS`, `BATCHES`, `PACKAGES`, `SHIPMENTS`, `ALERTS`, `INVESTIGATIONS`, `REPORTS` |
| Shared Components | `client/src/components/ui/index.jsx`, `components/scanner/QrScanner.jsx`, `components/shipments/*` | Reusable `DataTable`, `Modal`, `Drawer`, `StatusBadge`, `StatCard`, `Toast`, `Timeline`, `QrScanner`, `OutgoingEligibilityList`, `ReceivingModal`, `ShipmentReceivingDrawer` |

**Architecture Observation (`VERIFIED`):** Domain rules are cleanly isolated into `client/src/services/*.js` (`serialization.js`, `supplyChain.js`, `verification.js`), which makes state transitions testable without React. However, the persistence boundary, multi-organization session context, and QR artifact generation layer do not exist yet, and `DemoData.jsx` mixes direct closure reads with functional `setState` updaters.

---

## 3. State Management and Persistence Findings

This section directly answers the core state and persistence questions based on verified inspection of `client/src/app/App.jsx`, `client/src/contexts/DemoSession.jsx`, `client/src/contexts/DemoData.jsx`, `client/src/layouts/AppShell.jsx`, and `client/src/data/fixtures/index.js`.

### Q1. Why does refreshing reset the application state? — **VERIFIED**
- `DemoDataProvider` (`client/src/contexts/DemoData.jsx`) initializes every domain collection (`organizations`, `products`, `batches`, `packages`, `shipments`, `users`, `alerts`, `investigations`, `reports`) inside component-local `React.useState` seeded directly from `client/src/data/fixtures/index.js`.
- Neither `DemoDataProvider` nor any service/utility reads from or writes to `localStorage`, `sessionStorage`, `IndexedDB`, or cookies (`MISSING`).
- On a browser reload (`F5`), the JavaScript heap is destroyed and `DemoDataProvider` re-mounts from static fixture imports.

### Q2. Why does a refreshed authenticated session return to `/login`? — **VERIFIED**
- `DemoSessionProvider` (`client/src/contexts/DemoSession.jsx:4`) initializes `const [role, setRole] = useState(null)` with zero persistence.
- On reload, `role` becomes `null`.
- Every protected route is wrapped by `AppShell` (`client/src/app/router.jsx:87-97`), whose first check (`client/src/layouts/AppShell.jsx:8`) is:
  `if (!current) return <Navigate to="/login" replace />`
- Thus refreshing any `/manufacturer/*`, `/distributor/*`, `/wholesaler/*`, `/pharmacy/*`, `/admin/*`, or `/investigator/*` URL unconditionally discards the session and redirects to `/login`.

### Q3. Which data survives a refresh, and which data disappears? — **VERIFIED**
- **Survives refresh:**
  - Only static seed fixture data compiled from `client/src/data/fixtures/index.js` (`ORGS`, `USERS`, `PRODUCTS`, `BATCHES`, `PACKAGES`, `SHIPMENTS`, `ALERTS`, `INVESTIGATIONS`, `REPORTS`).
  - Browser URL path/query state (e.g., `/verify/results/:serial` or `/report?serial=...`), **but** upon reload those routes execute lookups against reset seed fixtures (`packages` loses any runtime-created serials or incremented `verifyCount`).
- **Disappears on refresh:**
  - Active preview role (`DemoSession.role`)
  - Created products, batches, batch QA release status changes, and newly serialized packages
  - Created shipments, partial/full receiving sessions, package dispositions (`accepted`, `quarantined`, `missing`, `rejected`), and discrepancy resolutions
  - Pharmacy dispensing events (`status: 'dispensed'`, custody history entries)
  - Public verification scan counts (`verifyCount`), customer counterfeit/tampering reports (`reports`)
  - Investigator alert status updates, newly opened cases, case notes, and case closures
  - Admin-added or suspended organizations and users

### Q4. Can a manufacturer-created product, batch, package, and shipment be accessed by downstream organizations? — **PARTIALLY IMPLEMENTED**
- **Within the same uninterrupted browser tab (`VERIFIED`):** Yes, *provided* the shipment destination is one of the hardcoded demo organizations (`d1` for Distributor, `w1` for Wholesaler, `p1` for Pharmacy). Clicking **Exit demo** (`AppShell.jsx:16`) sets `role` to `null` without unmounting `DemoDataProvider` (`App.jsx:8-9`), so switching to Distributor/Wholesaler/Pharmacy exposes the new batch, packages, and shipment in memory.
- **Across browser refresh (`MISSING`):** No—reloading erases the entire chain.
- **For newly created Admin organizations (`MISSING`):** No—if Manufacturer ships to a newly added Distributor or Distributor ships to a newly added Wholesaler/Pharmacy, that receiving org has no login/context switch in `DemoSession`/`Login` and cannot access the incoming shipment (`ORG_ID` is hardcoded to `'d1'`, `'w1'`, `'p1'`).

### Q5. Do mutations update every relevant portal consistently? — **PARTIALLY IMPLEMENTED**
- Core package/shipment mutations propagate to downstream `Incoming`, `Inventory`, `Outgoing`, `VerifyDispense`, and `Verify` within the active tab (`VERIFIED`).
- However, several cross-portal projections diverge (`PARTIALLY IMPLEMENTED` / defects):
  1. `manufacturer/dashboard/Dashboard.jsx` and `wholesaler/dashboard/Dashboard.jsx` count only `s.status === 'in_transit'` for pending/in-transit shipments, omitting `partially_received` and `reconciliation_required`.
  2. `manufacturer/shipments/Shipments.jsx` lacks `partially_received`, `reconciliation_required`, and `closed` filter tabs present in Distributor/Wholesaler views.
  3. `Serialization.jsx` renders ALL global `packages` instead of scoping by Manufacturer ownership (`m1`), leaking downstream pharmacy `dispensed` state inside Manufacturer's serialization registry.
  4. `alerts` (`DemoData`) are static—verify anomalies (`verifyCount > 2`) and receiving discrepancies do not emit alerts to Investigator `Alerts.jsx`.

### Q6. Are mutations resilient to multi-tab usage or stale-state closure issues? — **MISSING / DEFECTIVE**
- **Multi-tab synchronization (`MISSING`):** No `window.addEventListener('storage', ...)` or `BroadcastChannel` sync exists. Two open tabs immediately diverge.
- **Closure/Stale-State Defects in `DemoData.jsx` (`VERIFIED`):**
  - `verifyAndRecord` computes the incremented `verifyCount` and updated array via closure `packages` outside `setPackages`, risking lost updates if invoked in rapid succession or batched React renders.
  - `addProduct`, `addBatch`, `createShipment`, `recordReceivingSession`, `submitReport`, `addOrganization`, `addUser`, and `createInvestigation` compute IDs (`'p' + (products.length + 1)`, `'SHP-' + String(shipments.length).padStart(4, '0')`, etc.) from outer closure state while updating state with `prev => ...`. Rapid consecutive mutations in the same render tick produce duplicate IDs/refs or overwrite array entries.
  - `DemoDataProvider` passes an un-memoized `value={{ ... }}` object on every render, re-rendering all consumers on any single collection change.

### Q7. How should temporary client-side persistence work now without building a backend? — **MISSING**
- **Recommendation (Clean Separation for Future Backend Replacement):**
  - Keep `services/*.js` pure and API-compatible, keep `data/fixtures/index.js` strictly as immutable initial defaults, and add a versioned persistence adapter (e.g., `client/src/services/demoStorage.js` using `localStorage` with a schema version key like `pharmatrace_demo_state_v1` and session storage/localStorage key `pharmatrace_demo_session_v1`).
  - Provide an explicit **"Reset demo data"** action on `Login` / header so testers can intentionally restore factory fixtures when desired, while automatic reloads preserve active workflow progress.
  - Later backend integration can replace `DemoDataProvider` and `DemoSessionProvider` internals with REST/GraphQL/React Query calls without changing screen components.

---

## 4. Authentication / Session Restoration Findings

| Area | Current Behavior | Classification | Evidence |
|---|---|---|---|
| Sign-In (`Login.jsx`) | Renders 6 "Preview as {Role}" buttons calling `setRole(k)` + `nav('/<role>/dashboard')`; clearly labeled as development demo | **PARTIALLY IMPLEMENTED** | `client/src/features/authentication/Login.jsx:17-33` |
| Session Storage (`DemoSession.jsx`) | `useState(null)` only; zero `sessionStorage`/`localStorage` restoration | **MISSING** | `client/src/contexts/DemoSession.jsx:1-5` |
| Route Guards (`AppShell.jsx`) | Redirects `!current` -> `/login` and `current !== role` -> `/access-denied` synchronously | **VERIFIED** (guard works while in-memory; fails on F5 due to missing persistence) | `client/src/layouts/AppShell.jsx:8-9` |
| Organization / User Identity Binding | Session tracks only a role string (`'manufacturer'`, etc.), not `userId` or `orgId` | **MISSING** | `client/src/contexts/DemoSession.jsx:4`, `client/src/constants/navigation.js` |
| Suspended User Enforcement | Admin can suspend users (`USERS` `u7` or via `Users.jsx`), but `Login`/`DemoSession` never checks user status | **MISSING** | `client/src/features/authentication/Login.jsx`, `client/src/features/admin/users/Users.jsx` |
| Registration (`Register.jsx`) | Validates required fields and sets local component `submitted = true`; never persists request to `DemoData` or Admin queue; lost on navigation/refresh | **PARTIALLY IMPLEMENTED** | `client/src/features/authentication/Register.jsx:16-28` |
| Password Reset (`ForgotPassword.jsx`) | Validates email and sets local `submitted = true`; no state/feedback outside page | **PARTIALLY IMPLEMENTED** | `client/src/features/authentication/ForgotPassword.jsx:6-14` |
| Logout (`Exit demo`) | Sets `role(null)` and navigates to `/login`; preserves `DemoData` until refresh | **VERIFIED** | `client/src/layouts/AppShell.jsx:16` |

---

## 5. QR Generation and Scanning Findings

Inspecting `client/package.json`, `client/src/services/serialization.js`, `client/src/features/manufacturer/serialization/Serialization.jsx`, and `client/src/components/scanner/QrScanner.jsx` establishes the following status for all 8 required QR capabilities:

| # | Capability | Classification | Code Evidence & Gap Analysis |
|---|---|---|---|
| 1 | **Serial number generation** | **VERIFIED** | `generateBatchSerials` (`services/serialization.js:18-69`) produces formatted serials (`DEMO-<BATCH>-00001`), blocks un-released batches, and enforces `batch.quantity`. |
| 2 | **QR image / SVG / canvas generation** | **MISSING** | `client/package.json` contains `html5-qrcode` (decoder only) and **no** QR encoding library (`qrcode`, `qrcode.react`, `bwip-js`) or custom matrix generator. `Serialization.jsx` displays only monospace text. |
| 3 | **QR preview in Manufacturer portal** | **MISSING** | `Serialization.jsx` table (`lines 115-124`) and `Package details` drawer (`lines 126-152`) display metadata key-values and custody timeline only—no visual QR preview exists anywhere in the app. |
| 4 | **QR download (`PNG` / `SVG` / batch bundle)** | **MISSING** | Zero download buttons, blob exporters, or CSV/SVG/PNG generators exist in `Serialization.jsx` or anywhere under `client/src`. |
| 5 | **Printable package labels** | **MISSING** | No print layout, label preview modal, `window.print()` trigger, or `@media print` CSS stylesheet exists in `client/src/index.css` or `Serialization.jsx`. |
| 6 | **Package identity & payload binding** | **PARTIALLY IMPLEMENTED** | Serial strings (`DEMO-...`) uniquely bind to `package` records in `DemoData`. However, **no structured QR payload parser** exists: `QrScanner.jsx` passes `trimmed` decoded text verbatim, and all consumers (`Verify.jsx`, `VerifyDispense.jsx`, `ReceivingModal.jsx`, `Shipments.jsx`, `Outgoing.jsx`, `Search.jsx`) normalize raw input via `.trim().toUpperCase()`. Scanning a verification URL (e.g., `https://.../verify/results/DEMO-...`) or GS1/JSON payload fails to extract the serial. |
| 7 | **Duplicate prevention** | **VERIFIED** | `generateBatchSerials` (`services/serialization.js:44-50`) computes `maxSeq` across existing serials and checks `existingSerials` `Set` membership, avoiding collisions even when sequence gaps exist. |
| 8 | **Downstream QR scanning parity** | **PARTIALLY IMPLEMENTED** | `QrScanner.jsx` integrates `html5-qrcode` camera scanning + manual serial fallback across Manufacturer `Shipments`, Distributor `Incoming`/`Outgoing`, Wholesaler `Incoming`/`Outgoing`, Pharmacy `Incoming`/`VerifyDispense`, Investigator `Search`, and Public `Verify` (with a `qr-scanner-stub` option on Verify). **Gaps:** (a) Public `Report.jsx` lacks `QrScanner` (manual serial input only); (b) because Manufacturer cannot generate/display/download/print QR codes from newly serialized batches, downstream camera scanning cannot be completed end-to-end inside the app without using an external QR generator. |

---

## 6. Screen-by-Screen Functionality Assessment

**Summary:** Out of 30 mapped routes (plus fallback/denied views), zero `Placeholder.jsx` routes remain in `router.jsx:41-65`, **0** routes have persistent multi-session capability, and specific functional gaps are documented per screen below.

### 6.1 Authentication & Public Routes

| Route | Component | Status | Verified Capabilities vs. Gaps |
|---|---|---|---|
| `/login` | `authentication/Login.jsx` | **PARTIALLY IMPLEMENTED** | Switches role in memory (`VERIFIED`); no user/org selector, no password/role account emulation (`u7` suspended ignored), no "Reset demo data" button (`MISSING`). |
| `/register` | `authentication/Register.jsx` | **PARTIALLY IMPLEMENTED** | Client-side form validation & preview card (`VERIFIED`); local component state only—submitted org requests are discarded and invisible to Admin (`MISSING`). |
| `/forgot-password` | `authentication/ForgotPassword.jsx` | **PARTIALLY IMPLEMENTED** | Form + confirmation state (`VERIFIED`); local state only, no persistence or feedback outside component. |
| `/verify` | `public-verification/verify/Verify.jsx` | **PARTIALLY IMPLEMENTED** | `QrScanner` + sample chips + navigates to `/verify/results/:serial` (`VERIFIED`); fails if QR encodes a full URL rather than bare serial (`MISSING` payload parser); newly generated manufacturer packages vanish on reload (`MISSING` persistence). |
| `/verify/results/:serial` | `public-verification/results/Results.jsx` | **PARTIALLY IMPLEMENTED** | Calls `verifyAndRecord` (`DemoData`), renders Authentic / Caution / Expired / Quarantined / Incomplete / Unknown + chain-of-custody timeline + "Report issue" link (`VERIFIED`); F5 on result URL resets fixtures so runtime serials show **Unknown**; `verifyAndRecord` uses closure-based array read (`DEFECT`) and doesn't emit Investigator alerts on `verifyCount > 2`; `rejected`/`missing` packages show generic `incomplete` banner rather than flagged discrepancy notice (`PARTIALLY IMPLEMENTED`). |
| `/report` | `public-verification/report/Report.jsx` | **PARTIALLY IMPLEMENTED** | Pre-fills `?serial=` query param, validates form, appends to `DemoData.reports` visible in Investigator Alerts (`VERIFIED`); **no `QrScanner`** on report screen (`MISSING`); does not auto-generate an Investigator Alert lead (`MISSING`). |
| `/access-denied`, `*` | `app/router.jsx:67-76,86,98` | **VERIFIED** | Clean fallback views with link back to `/login`. |

### 6.2 Manufacturer Portal (`ORG_ID = 'm1'` hardcoded)

| Route | Component | Status | Verified Capabilities vs. Gaps |
|---|---|---|---|
| `/manufacturer/dashboard` | `manufacturer/dashboard/Dashboard.jsx` | **PARTIALLY IMPLEMENTED** | Dynamic stats + Recharts bar chart (`VERIFIED`); **Gap:** `Pending acceptance` stat counts only `s.status === 'in_transit'`, ignoring `partially_received` and `reconciliation_required` shipments; lacks text search or quick deep-links. |
| `/manufacturer/products-batches` | `manufacturer/products-batches/ProductsBatches.jsx` | **PARTIALLY IMPLEMENTED** | Create product, toggle product Active/Inactive, create batch (`mfd`/`exp`/qty), toggle QA release status (`VERIFIED`); **Gap:** Inactive products can still be selected in Create Batch modal (`line 429`); no edit product/batch, no search bar, no `exp > mfd` guard in `DemoData.addBatch` itself, not scoped by `orgId`. |
| `/manufacturer/serialization` | `manufacturer/serialization/Serialization.jsx` | **PARTIALLY IMPLEMENTED** | Generates unique serials per QA-released batch, enforces cap, drawer timeline (`VERIFIED`); **Critical Gaps:** **Zero QR code rendering, preview, download, or label printing (`MISSING`)**; lists ALL global packages regardless of custody/manufacturer (`DEFECT`); allows selecting batches of `'inactive'` products. |
| `/manufacturer/shipments` | `manufacturer/shipments/Shipments.jsx` | **PARTIALLY IMPLEMENTED** | Multi-step dispatch modal with `QrScanner` + `OutgoingEligibilityList` (`accepted` packages at `m1`), destination filtering (`verified non-suspended non-self`), shipment drawer (`VERIFIED`); **Gaps:** `FILTERS` tabs (`all`, `pending`, `in_transit`, `accepted`) **omit** `partially_received`, `reconciliation_required`, and `closed`! Dispatches are lost on F5; no text search. |

### 6.3 Distributor Portal (`ORG_ID = 'd1'` hardcoded)

| Route | Component | Status | Verified Capabilities vs. Gaps |
|---|---|---|---|
| `/distributor/dashboard` | `distributor/dashboard/Dashboard.jsx` | **PARTIALLY IMPLEMENTED** | Incoming, inventory, outgoing stats (`VERIFIED`); **Gap:** counts only `accepted` inventory, omitting held `quarantined` units metric/alert; hardcoded `ORG_ID = 'd1'`. |
| `/distributor/incoming` | `distributor/incoming/Incoming.jsx` | **VERIFIED** *(in-memory only)* | Full status filter tabs (`pending_all`, `in_transit`, `partially_received`, `reconciliation_required`, `accepted`, `closed`, `all`), `ReceivingModal` with camera/manual serial scan, partial/full/quarantine/missing/rejected session recording, `ShipmentReceivingDrawer` + reconciliation (`VERIFIED`). Fails across F5 and hardcoded to `'d1'`. |
| `/distributor/inventory` | `distributor/inventory/Inventory.jsx` | **PARTIALLY IMPLEMENTED** | Shows accepted/quarantined/discrepancy at `d1`, package details drawer (`VERIFIED`); **Gaps:** Status `<select>` lacks explicit `discrepancy` option; search bar filters `serial` only (not medicine/batch); does not surface outgoing `missing`/`rejected` exception items still linked to `d1`; hardcoded `ORG_ID = 'd1'`. |
| `/distributor/outgoing` | `distributor/outgoing/Outgoing.jsx` | **VERIFIED** *(in-memory only)* | Multi-select eligible `accepted` stock at `d1`, dispatch to active non-Manufacturer / non-self orgs (`VERIFIED`). Fails on F5 and shipments to new Admin-created Wholesalers cannot be received by them due to `'w1'` hardcoding. |

### 6.4 Wholesaler Portal (`ORG_ID = 'w1'` hardcoded)

| Route | Component | Status | Verified Capabilities vs. Gaps |
|---|---|---|---|
| `/wholesaler/dashboard` | `wholesaler/dashboard/Dashboard.jsx` | **PARTIALLY IMPLEMENTED** | Stats & recent activity (`VERIFIED`); **Gaps:** `In-transit outgoing` counts only `in_transit` (misses `partially_received` & `reconciliation_required`), `Inventory` omits `quarantined` metric; hardcoded `'w1'`. |
| `/wholesaler/incoming` | `wholesaler/incoming/Incoming.jsx` | **VERIFIED** *(in-memory only)* | Identical full receiving/reconciliation capability scoped to `'w1'` (`VERIFIED`). Volatile + `'w1'` hardcoded. |
| `/wholesaler/inventory` | `wholesaler/inventory/Inventory.jsx` | **PARTIALLY IMPLEMENTED** | Medicine/serial/batch search + `accepted`/`quarantined`/`discrepancy` filter + expiry warning (`VERIFIED`); **Gap:** hides outgoing `missing`/`rejected` items still in `'w1'` custody; hardcoded `'w1'`. |
| `/wholesaler/outgoing` | `wholesaler/outgoing/Outgoing.jsx` | **VERIFIED** *(in-memory only)* | Dispatches eligible `w1` stock to Pharmacies (`VERIFIED`). Volatile + shipments to new Admin Pharmacies stranded. |

### 6.5 Pharmacy Portal (`PHARMACY_ID = 'p1'` hardcoded)

| Route | Component | Status | Verified Capabilities vs. Gaps |
|---|---|---|---|
| `/pharmacy/dashboard` | `pharmacy/dashboard/Dashboard.jsx` | **PARTIALLY IMPLEMENTED** | Dynamic stats including quarantined count & incoming awaiting receipt (`VERIFIED`); hardcoded `'p1'`, volatile state. |
| `/pharmacy/incoming` | `pharmacy/incoming/Incoming.jsx` | **VERIFIED** *(in-memory only)* | Full multi-session receiving + reconciliation scoped to `'p1'` (`VERIFIED`). Volatile + `'p1'` hardcoded. |
| `/pharmacy/inventory` | `pharmacy/inventory/Inventory.jsx` | **PARTIALLY IMPLEMENTED** | Displays `accepted`, `quarantined`, `discrepancy`, and `dispensed` packages at `'p1'`, with expiry warnings (`VERIFIED`); **Gap:** lacks search bar / status filter controls (`Inventory` has `accepted`/`quarantined`/`discrepancy`/`dispensed` mixed together in one flat table without filter). |
| `/pharmacy/verify-dispense` | `pharmacy/verify-dispense/VerifyDispense.jsx` | **VERIFIED** *(in-memory only)* | `QrScanner` + manual serial verification enforcing custody at `'p1'`, blocks expired/quarantined/dispensed/already-missing packages, records patient/Rx reference in `dispensePackage` (`DemoData.jsx:336` also hardcodes `'p1'`). Volatile + `'p1'` hardcoded. |

### 6.6 System Administrator Portal

| Route | Component | Status | Verified Capabilities vs. Gaps |
|---|---|---|---|
| `/admin/dashboard` | `admin/dashboard/Dashboard.jsx` | **PARTIALLY IMPLEMENTED** | Live org/user/package/alert counts & Recharts bar chart (`VERIFIED`); does not surface pending registration requests (since `Register.jsx` saves nothing). |
| `/admin/organizations` | `admin/organizations/Organizations.jsx` | **PARTIALLY IMPLEMENTED** | Create org + toggle Active/Suspended (`VERIFIED`); suspended orgs drop from outgoing `<select>` lists (`VERIFIED`), **but** newly created orgs cannot be logged into or viewed in any portal (`MISSING` multi-org context) and lacks edit/search. |
| `/admin/users` | `admin/users/Users.jsx` | **PARTIALLY IMPLEMENTED** | Create user + toggle Active/Suspended (`VERIFIED`); **Critical Gap:** user status (`suspended`) has zero operational impact because `DemoSession` has no user/credential binding (`u7` cannot even attempt sign-in). |

### 6.7 Investigation Officer Portal

| Route | Component | Status | Verified Capabilities vs. Gaps |
|---|---|---|---|
| `/investigator/dashboard` | `investigator/dashboard/Dashboard.jsx` | **PARTIALLY IMPLEMENTED** | Dynamic counts & alert preview drawer (`VERIFIED`); **Bug:** hardcoded `const TODAY = '2026-11-12'` used for `resolvedDate` (`line 14, 79`) instead of `getCurrentDateIso()`; underlying `alerts` are static fixtures (`MISSING` auto-generation). |
| `/investigator/alerts` | `investigator/alerts/Alerts.jsx` | **PARTIALLY IMPLEMENTED** | Review/dismiss alerts, escalate to case (`investigations`), view public `reports` (`VERIFIED`); **Bugs/Gaps:** hardcoded `const TODAY = '2026-11-12'` (`line 12, 86`); **no automatic alert creation** when `verifyCount > 2`, receiving discrepancy (`damaged`/`missing`/`rejected`), or batch anomaly occurs (`MISSING`). |
| `/investigator/search` | `investigator/search/Search.jsx` | **PARTIALLY IMPLEMENTED** | Multi-criteria search across serial/batch/product + `QrScanner` + package drawer (`VERIFIED`); lacks ability to **place a recall/regulatory hold/quarantine** directly on a suspect package or batch (`MISSING`). |
| `/investigator/investigations` | `investigator/investigations/Investigations.jsx` | **PARTIALLY IMPLEMENTED** | List open/closed cases, append notes, close case with findings (`VERIFIED`); lacks package-hold/batch-recall containment actions (`MISSING`) and lacks case creation directly from Investigation screen (only from Alerts or Search—wait: verified Search links to Investigations? Actually Investigations creates cases from Alerts only; `Investigations.jsx` has no "New case" button). |

---

## 7. Full Supply-Chain Workflow Assessment

Tracing the complete required journey inside the actual application:

### End-to-End Journey Result: **PARTIALLY IMPLEMENTED (Fails Multi-Session Persistence, Physical QR Workflow, and Multi-Org Support)**

| Stage | Action | Consumed / Mutated Data | Cross-Role Visibility | Survives Refresh? | Missing / Broken Friction |
|---|---|---|---|---|---|
| **1. Manufacturer Setup** | Create Product + Batch + QA Release (`ProductsBatches.jsx`) | Appends to `products`, `batches` (`release: 'Released'`) | Global `products` / `batches` updated in memory | **NO** | Inactive product still allowed in Create Batch modal; no `m1` scoping on `ProductsBatches` |
| **2. Serialization & QR** | Generate Serials (`Serialization.jsx`) | Appends `DEMO-<batch>-00001..N` (`custodian: 'm1'`, `status: 'accepted'`) | Immediately eligible in `Shipments.jsx` (`m1`) | **NO** | **CRITICAL:** No QR code rendered, no preview, no download, no printable label (`MISSING`). User must manually copy text serials. |
| **3. M → D Dispatch** | Create Shipment (`Shipments.jsx`) | Appends `SHP-XXXX` (`status: 'in_transit'`), moves package `status: 'in_transit'` (custodian stays `'m1'`) | Appears in Distributor `Incoming` (`d1`) | **NO** | Stranded if dispatched to a newly created Admin Distributor (`'d1'` hardcoded). Manufacturer filter tabs omit `partially_received` / `reconciliation_required`. |
| **4. D Partial/Full Receive** | Open `ReceivingModal` (`distributor/incoming/Incoming.jsx`) | Calls `recordReceivingSession` → moves accepted/quarantined items to `custodian: 'd1'`, rejected/missing stay at `'m1'`, updates shipment status | Accepted stock enters Distributor `Inventory` & `Outgoing`; Manufacturer sees updated `Shipment` status | **NO** | Works with manual serials or external text QR (`VERIFIED`); physical QR scanned from Manufacturer screen is impossible. |
| **5. D → W → P Handoff** | Repeat Dispatch & Receive (`distributor/outgoing`, `wholesaler/*`, `pharmacy/incoming`) | Moves custodian `d1 → w1 → p1`; logs history events (`Dispatched`, `Received`, etc.) | Reflected across `Inventory`, `Incoming`, `Verify` | **NO** | Same single-org hardcoding (`d1`, `w1`, `p1`) and volatile memory constraints apply at every hop. |
| **6. Pharmacy Verify & Dispense** | Scan/Enter Serial (`VerifyDispense.jsx`) | Verifies `custodian === 'p1'`, `status === 'accepted'`, non-expired; sets `status: 'dispensed'`, appends history | Package status turns `dispensed` in `pharmacy/inventory` & public `verify` | **NO** | `dispensePackage` hardcodes `'p1'`. |
| **7. Public Verify & Report** | Scan/Enter Serial (`/verify` → `/verify/results/:serial` → `/report`) | `verifyAndRecord` increments `verifyCount`; `submitReport` appends to `reports` | Customer sees custody timeline; Investigator `Alerts` shows new Public Report | **NO** | High `verifyCount` (>2) warns consumer (`Caution`) **but creates zero Investigator Alert lead**; `Report.jsx` lacks `QrScanner`. |
| **8. Investigator Oversight** | Review Alerts & Close Case (`investigator/*`) | Dismisses/escalates `alerts`, creates/closes `investigations` | Case state persists in memory | **NO** | Hardcoded `'2026-11-12'` resolution date; cannot place package/batch hold or recall that blocks pharmacy dispensing or warns public verification. |

---

## 8. Cross-Portal Consistency Assessment

**Status:** **PARTIALLY IMPLEMENTED** (Core `services/supplyChain.js` transitions are sound; UI projections & scoping contain verified mismatches.)

| Consistency Dimension | Findings | Classification |
|---|---|---|
| **Package Status Lifecycle (`accepted`, `in_transit`, `quarantined`, `missing`, `rejected`, `dispensed`)** | Core transitions in `applyReceivingSession` and `dispensePackage` preserve invariants cleanly (`24/24` unit tests). **Defect:** Manufacturer `Serialization.jsx:19` renders global `packages` unfiltered by custodian (`m1`), showing pharmacy-dispensed statuses inside Manufacturer serialization registry. | **PARTIALLY IMPLEMENTED** |
| **Custody Transfer & Rejection Accounting** | `accepted` and `quarantined` move custody to recipient (`shipment.to`); `missing` and `rejected` remain at sender (`shipment.from`). **Defect:** Distributor and Wholesaler `Inventory.jsx` only list `[accepted, quarantined, discrepancy]` at their `custodian` — so **outgoing** items marked `missing` or `rejected` by a downstream receiver are hidden from sender Inventory (visible only inside the Shipment drawer). | **PARTIALLY IMPLEMENTED** |
| **Shipment Status Parity Across Portals** | Incoming/Outgoing portals support all 6 statuses (`in_transit`, `partially_received`, `reconciliation_required`, `accepted`, `closed`, plus `cancelled`/`pending`), **but** `manufacturer/shipments/Shipments.jsx` filter tabs omit `partially_received`, `reconciliation_required`, and `closed`. | **PARTIALLY IMPLEMENTED** |
| **Dashboard vs. Operational Screens** | `manufacturer/dashboard` (`Pending acceptance`) and `wholesaler/dashboard` (`In-transit outgoing`) undercount shipments in `partially_received` or `reconciliation_required` states; `distributor/dashboard` & `wholesaler/dashboard` omit held `quarantined` counts while `pharmacy/dashboard` shows them. | **PARTIALLY IMPLEMENTED** |
| **Organization & User Authority** | Suspending an org removes it from outgoing destination dropdowns (`VERIFIED`). However, Admin cannot enable login as newly created orgs (hardcoded `'m1'/'d1'/'w1'/'p1'`), and suspending a user (`Users.jsx`) enforces nothing. | **PARTIALLY IMPLEMENTED** |
| **Verification & Investigator Sync** | `Verify` (`Results.jsx`) updates `verifyCount` immediately across portal views (`VERIFIED`), and `Report.jsx` appends to Investigator `Public Reports` (`VERIFIED`), **but** suspicious verification spikes (`verifyCount > 2`), unverified/unknown lookups, and supply-chain discrepancies do NOT emit new Investigator Alerts (`MISSING`). | **MISSING / PARTIALLY IMPLEMENTED** |

---

## 9. Hardcoded / Static Functionality Findings

Clearly distinguishing legitimate seed demo data from operational/UI hardcoding that undermines real workflows:

### A. Legitimate Seed Fixtures (Acceptable in `data/fixtures/index.js` while no backend exists)
- **VERIFIED:** Initial `ORGS` (`m1`, `d1`, `w1`, `p1`), `USERS` (`u1..u7`), `PRODUCTS`, `BATCHES` (`b1..b3`), `PACKAGES` (`16` demo serials across chain states), `SHIPMENTS` (`SHP-0000..SHP-0005`), `ALERTS` (`alt1..alt4`), `INVESTIGATIONS` (`inv1..inv2`), `REPORTS` (`rep1`).

### B. Unacceptable Operational / UI Hardcoding Requiring Remediation
1. **Hardcoded Tenant Organization IDs (`VERIFIED`):**
   - `'m1'` hardcoded in `manufacturer/shipments/Shipments.jsx:22`, `services/serialization.js:61`, `services/verification.js:12`.
   - `'d1'` hardcoded in all 4 Distributor screens (`Dashboard.jsx`, `Incoming.jsx`, `Inventory.jsx`, `Outgoing.jsx`).
   - `'w1'` hardcoded in all 4 Wholesaler screens (`Dashboard.jsx`, `Incoming.jsx`, `Inventory.jsx`, `Outgoing.jsx`).
   - `'p1'` hardcoded in all 4 Pharmacy screens + `DemoData.jsx` (`dispensePackage`).
   - Static org display name in `constants/navigation.js` (`ROLES[role].org`) does not reflect dynamic org switching.
2. **Hardcoded Dates in Investigator Portal (`VERIFIED`):**
   - `client/src/features/investigator/dashboard/Dashboard.jsx:14` (`const TODAY = '2026-11-12'`) and `client/src/features/investigator/alerts/Alerts.jsx:12` (`const TODAY = '2026-11-12'`) stamp old hardcoded dates on newly closed/dismissed alerts instead of `getCurrentDateIso()`. *(Note: `DemoData.jsx` already fixed `TODAY` via `getCurrentDateIso()`, leaving these 2 views mismatched.)*
3. **Frozen Alert Stream (`VERIFIED`):**
   - `DemoData.alerts` only ever contains `alt1..alt4` from fixtures. No runtime event (`verifyCount > 2`, missing/rejected receiving discrepancy, expired batch dispatch/dispense) generates new alerts.
4. **Local-Only Auth Sub-Screens (`VERIFIED`):**
   - `Register.jsx` and `ForgotPassword.jsx` only toggle local `submitted` state and store zero data in shared context/storage.
5. **Lack of Runtime Environment/Validation Helpers (`PARTIALLY IMPLEMENTED`):**
   - `DataTable` (`components/ui/index.jsx`) has pagination (`pageSize`) only—no column sorting (`MISSING`), and multiple operational tables (`ProductsBatches`, `Shipments`, `Incoming`, `Outgoing`, `Investigations`) lack search filtering.

---

## 10. Existing Test Coverage and Missing Tests

### 10.1 Executed Test Baseline (`VERIFIED`)
Ran `npm test` (`node --test tests/*.test.js`) in `D:\pharmatrace-ai\client`: **24 passed, 0 failed** (`334.66ms`).

| Test File | Tests | Scope Covered |
|---|---|---|
| `client/tests/fixtures.test.js` | 3 | Fixture structural integrity (`b1..b3`, `SHP-0000..0005` count/status consistency, custodian matching) |
| `client/tests/serialization.test.js` | 4 | Sequential `DEMO-` format, QA release gate, batch capacity cap, collision prevention across sequence gaps |
| `client/tests/supplyChain.test.js` | 8 | `computeShipmentStatus`, single-session/multi-session partial receiving, discrepancy & reconciliation thresholds, custody & outgoing eligibility rules |
| `client/tests/verification.test.js` | 9 | Authentic, first-time threshold (`verifyCount` 1–2 vs >2 caution), unknown, expired, quarantined, dispensed, incomplete/in-transit states |

### 10.2 Critical Missing Test Coverage (`MISSING`)
`client/package.json` contains **zero** React DOM/component test libraries (`vitest`, `@testing-library/react`, `jsdom`) and **zero** automated E2E/persistence/QR tests inside the project repo:

1. **Refresh & Persistence Tests (`MISSING`):** Verifying state & active session survive browser reload (`F5`) via `localStorage` / `sessionStorage`, plus intentional demo-reset clearing state cleanly.
2. **React Component & Context Integration Tests (`MISSING`):** `DemoData.jsx` closure safety under batched calls, `AppShell` route guard behavior on reload, dashboard metric parity across all 6 portals.
3. **QR Generation, Download, Print & Payload Parsing Tests (`MISSING`):** Verifying QR SVG/Canvas output matches generated serials, downloads valid files, print view contains label metadata + QR, and `QrScanner` consumers handle both raw serials and structured QR URLs/payloads.
4. **End-to-End Multi-Portal & Multi-Org UI Workflow Tests (`MISSING`):** Full Manufacturer → Distributor → Wholesaler → Pharmacy → Public Verify → Public Report → Investigator flow spanning session reloads and dynamic Admin-created organizations.
5. **Security / Role-Boundary & Negative Path UI Tests (`MISSING`):** Verifying suspended orgs/users are blocked, inactive products block batch creation/serialization, and cross-role direct URL access enforces `/access-denied`.

---

## 11. Prioritized Defects and Missing Features

| Priority | ID | Item | Classification | Impacted Files |
|---|---|---|---|---|
| **P0 (Critical)** | **GAP-01** | **Zero State & Session Persistence across Reload (`F5`)** — reloads reset all 9 collections to static fixtures and boot authenticated users back to `/login`. | **MISSING** | `contexts/DemoSession.jsx`, `contexts/DemoData.jsx`, `layouts/AppShell.jsx` |
| **P0 (Critical)** | **GAP-02** | **No Manufacturer QR Code Generation, Label Preview, Image Download, or Print Output** — serials are text-only; `html5-qrcode` cannot scan newly created packages without external tools. | **MISSING** | `client/package.json`, `features/manufacturer/serialization/Serialization.jsx`, `services/serialization.js` |
| **P0 (Critical)** | **GAP-03** | **Hardcoded Single-Org IDs (`'m1'`, `'d1'`, `'w1'`, `'p1'`)** — newly created Admin organizations and users cannot log in or receive/manage shipments dispatched to them. | **PARTIALLY IMPLEMENTED** | `contexts/DemoSession.jsx`, `constants/navigation.js`, all M/D/W/P screens, `DemoData.jsx:336` |
| **P1 (High)** | **GAP-04** | **Stale Closure Mutations & Non-Unique Ref/ID Generation in `DemoData.jsx`** — closure reads during `setState` risk lost updates (`verifyAndRecord`, `createShipment`, etc.) and re-render inefficiency. | **VERIFIED** (Defect) | `client/src/contexts/DemoData.jsx` |
| **P1 (High)** | **GAP-05** | **No Dynamic Investigator Alert Generation or Package Hold/Recall Action** — `verifyCount > 2` and receiving discrepancies (`damaged`/`missing`/`rejected`) fail to create Investigator alerts; investigators cannot freeze/quarantine suspect stock. | **MISSING** | `contexts/DemoData.jsx`, `features/investigator/*` |
| **P1 (High)** | **GAP-06** | **Hardcoded `TODAY = '2026-11-12'` in Investigator Views** — produces inaccurate resolution dates on dismiss/escalate actions. | **VERIFIED** (Defect) | `features/investigator/dashboard/Dashboard.jsx:14`, `features/investigator/alerts/Alerts.jsx:12` |
| **P1 (High)** | **GAP-07** | **Manufacturer Shipments & Cross-Portal Dashboard Filter Mismatches** — Manufacturer Shipments missing `partially_received` / `reconciliation_required` / `closed` tabs; Manufacturer & Wholesaler dashboards undercount pending/in-transit shipments; D/W dashboards omit `quarantined` count. | **PARTIALLY IMPLEMENTED** | `manufacturer/shipments/Shipments.jsx:24-29`, `manufacturer/dashboard/Dashboard.jsx:22`, `wholesaler/dashboard/Dashboard.jsx:21`, `distributor/dashboard/Dashboard.jsx` |
| **P1 (High)** | **GAP-08** | **Manufacturer `Serialization` Cross-Custodian Leakage & Sender Missing/Rejected Visibility** — Serialization table shows all global packages (including Pharmacy-dispensed items); D/W Inventory hides outgoing rejected/missing units still in sender custody. | **PARTIALLY IMPLEMENTED** | `manufacturer/serialization/Serialization.jsx:19`, `distributor/inventory/Inventory.jsx`, `wholesaler/inventory/Inventory.jsx` |
| **P2 (Medium)** | **GAP-09** | **Inactive Product Guard Bypass & Missing `DemoData.addBatch` Date Validation** — inactive products can still have batches created (`ProductsBatches.jsx:429`) and serialized. | **PARTIALLY IMPLEMENTED** | `manufacturer/products-batches/ProductsBatches.jsx`, `manufacturer/serialization/Serialization.jsx`, `contexts/DemoData.jsx` |
| **P2 (Medium)** | **GAP-10** | **`Register.jsx` & `Report.jsx` Disconnections** — registration requests aren't saved for Admin review; `Report.jsx` lacks `QrScanner`; `Public Verify` lumps `rejected`/`missing` into generic `incomplete`. | **PARTIALLY IMPLEMENTED** | `authentication/Register.jsx`, `public-verification/report/Report.jsx`, `services/verification.js` |
| **P2 (Medium)** | **GAP-11** | **Table Search/Sort & Pharmacy Inventory Filter Gaps** — `DataTable` lacks sorting; `Pharmacy Inventory` lacks status filter/search; `Distributor Inventory` lacks `discrepancy` dropdown option & batch/medicine search. | **PARTIALLY IMPLEMENTED** | `components/ui/index.jsx`, `pharmacy/inventory/Inventory.jsx`, `distributor/inventory/Inventory.jsx` |
| **P3 (Low)** | **GAP-12** | **No Automated UI / Integration / E2E Test Suite Committed in `client/`** — only 24 pure-JS unit tests exist. | **MISSING** | `client/package.json`, `client/tests/` |

---

## 12. Recommended Remediation Sequence

Execute in strict dependency order, maintaining clean separation between temporary client-side demo storage (`Phase 1.5`) and future backend/MySQL API integration (`Phase 2`):

1. **Step 1 — Persist Session & Domain State + Fix Closure Mutations (`GAP-01`, `GAP-04`)**
   - Create `client/src/services/demoStorage.js` with versioned `localStorage` persistence for `DemoData` and `sessionStorage`/`localStorage` persistence for `DemoSession`, plus a user-triggered **Reset demo data** button on `Login` / header.
   - Refactor `DemoData.jsx` callbacks to derive next IDs/updates deterministically inside functional updaters (`setState(prev => ...)`), memoize context value, and optionally sync across tabs via `storage` event.
2. **Step 2 — Bind Dynamic Organization & User Session Context (`GAP-03`, `GAP-10`)**
   - Upgrade `DemoSession` to track `{ role, orgId, userId }` (defaulting to primary active seed user/org per role, with optional account switcher on `Login` showing all active orgs/users and disabling `suspended` users/orgs).
   - Remove hardcoded `'m1'`, `'d1'`, `'w1'`, `'p1'` constants from all M/D/W/P screens and `DemoData.dispensePackage`, reading `orgId` from session context and updating `AppShell` sidebar org label dynamically.
   - Persist `Register.jsx` requests into a `registrationRequests` demo collection reviewable/approvable in Admin `Organizations.jsx`.
3. **Step 3 — Implement Complete Manufacturer QR Generation, Preview, Export & Payload Contract (`GAP-02`)**
   - Add a lightweight client QR generator (e.g., `qrcode` npm package) and `client/src/services/qr.js` utility supporting both standardized payload encoding/parsing (accepting raw `DEMO-...` serials and verification URLs).
   - Update `Serialization.jsx` table & `Package details` drawer to display scannable QR previews, single QR PNG/SVG download, and a printable batch label sheet (`@media print` + `window.print()`).
   - Add `QrScanner` to `Report.jsx` so every scan entry point has consistent QR support.
4. **Step 4 — Align Investigator Rules, Containment Actions & Date Fix (`GAP-05`, `GAP-06`)**
   - Replace hardcoded `TODAY = '2026-11-12'` in `investigator/dashboard/Dashboard.jsx` and `investigator/alerts/Alerts.jsx` with `getCurrentDateIso()`.
   - Automatically generate Investigator alerts on `verifyCount > 2`, receiving `damaged`/`missing`/`rejected` discrepancies, and expired package attempts.
   - Add an Investigator action to place/lift an official hold/quarantine/recall on a package or batch, updating `verify` and `verify-dispense` safeguards.
5. **Step 5 — Fix Cross-Portal Filter, Ownership & Inventory Consistency (`GAP-07`, `GAP-08`, `GAP-09`, `GAP-11`)**
   - Scope Manufacturer `Serialization.jsx` view cleanly (separate "Owned/Serialized Stock" vs "Downstream Tracked Units" or show sender origin filter) so pharmacy dispensing is clearly separated from active manufacturer stock.
   - Add `partially_received`, `reconciliation_required`, and `closed` filter tabs to `manufacturer/shipments/Shipments.jsx` and include them in M/W dashboard pending/in-transit metrics; surface `quarantined` metrics on D/W dashboards and `missing`/`rejected` exception tabs or badges on D/W Inventory.
   - Block batch creation and serialization for `'inactive'` products, enforce `exp > mfd` inside `DemoData.addBatch`, add search/filter to `Pharmacy Inventory` and `discrepancy` option to `Distributor Inventory`, and enhance `Public Verify` notice clarity for `rejected`/`missing` packages.
6. **Step 6 — Add Automated Frontend Integration & Persistence Verification (`GAP-12`)**
   - Expand unit + React component integration tests (e.g., Vitest + React Testing Library) covering `localStorage` reload persistence, QR generation/parsing, multi-org workflow handoff, Investigator auto-alerts, and negative authorization checks.

---

## 13. Objective Frontend Completion Acceptance Criteria

The PharmaTrace AI frontend can be declared **functionally complete (Phase 1.5 Demo Ready / Backend Handoff Ready)** only when ALL of the following pass objectively:

1. **Persistence & Refresh Gate:**
   - Creating a product, batch, serials, shipment, partial receipt, dispense, public report, org, user, and investigation case, then executing a full browser reload (`F5`) on any authenticated route (e.g., `/distributor/incoming`) preserves the active role/org session **without** redirecting to `/login`, and preserves **100%** of mutated records.
   - Triggering **Reset demo data** restores clean fixture defaults.
2. **QR Generation & Scanning Parity Gate:**
   - Manufacturer can render a scannable QR graphic for every serialized package in the UI, download a QR image (`PNG`/`SVG`), and open a printable label sheet view containing product, batch, expiry, serial, and QR.
   - A QR payload generated by Manufacturer decodes cleanly in `QrScanner` across Receiving, Outgoing, Dispense, Investigator Search, Public Verify, and Public Report screens.
3. **End-to-End Multi-Org Delivery Gate:**
   - Admin creates a new Distributor or Pharmacy organization and user; Manufacturer creates a new Product → Released Batch → Serials → Shipment to that newly created Distributor; logging in/previewing as that new org shows the shipment, completes two-session partial receiving (`in_transit` → `partially_received` → `accepted`/`reconciliation_required`), forwards to Wholesaler → Pharmacy → Dispenses → Public Verify & Report → Investigator Alerts/Case resolution.
4. **Cross-Portal Integrity & Guard Gate:**
   - Inactive products cannot accept new batches or serials; suspended orgs cannot receive dispatches; suspended users cannot sign into demo sessions; zero hardcoded `'2026-11-12'` dates remain; all dashboard counters and shipment filter tabs match underlying collection states identically across M/D/W/P portals.
5. **Automated Quality Gate:**
   - All `node:test` unit suites, new React persistence/QR/multi-org integration tests, production `vite build` (0 warnings/errors), and Playwright/CDP browser acceptance checks (including `F5` reload tests) pass cleanly.
