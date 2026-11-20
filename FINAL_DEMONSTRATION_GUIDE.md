# PharmaTrace AI — Final Demonstration & Verification Guide

**Milestone:** M9 Final System Integration & Delivery Hardening  
**Target Application URL:** `http://localhost:5173`  
**Backend API URL:** `http://localhost:5000`  
**Shared Password:** `ValidPass123!#`  

---

## 1. Stakeholder Credentials & Access Directory

PharmaTrace AI features six canonical stakeholder roles, each strictly partitioned with live backend MariaDB-backed role-based access control (RBAC).

| # | Role Canonical Name | Portal Access URL | Stakeholder Email | Organization Name | Key Authorized Capabilities |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | **`admin`** | `/admin/dashboard` | `admin_m6@pharmatrace.test` | DGDA Regulatory Lead | System governance, organization audits, user lockout unlock, category policies. |
| **2** | **`investigator`** | `/investigator/dashboard` | `indep_officer_mwnog5r9@pharmatrace.test` | Regulatory Enforcement | Automated anomaly detection, cross-tier package tracing, case files & immutable evidence. |
| **3** | **`manufacturer`** | `/manufacturer/dashboard` | `mfg_user_m6@pharmatrace.test` | M6 Apex Pharma Ltd | Medicine product registration, batch management, QA release, GS1 serialization & dispatch. |
| **4** | **`distributor`** | `/distributor/dashboard` | `dist_user_dev@pharmatrace.test` | PharmaTrace Dev Central Logistics Ltd | Incoming shipment intake, damaged/missing disposition, quarantine isolation, wholesale dispatch. |
| **5** | **`wholesaler`** | `/wholesaler/dashboard` | `whol_user_dev@pharmatrace.test` | PharmaTrace Dev Wholesale Depot Ltd | Distributor shipment intake, depot custody management, retail pharmacy dispatch. |
| **6** | **`pharmacy`** | `/pharmacy/dashboard` | `pharm_user_dev@pharmatrace.test` | PharmaTrace Dev Model Pharmacy | Wholesale shipment intake, verified inventory on hand, dispensing safety & duplicate scan alerts. |

---

## 2. End-to-End 8-Step Demonstration Workflow

Follow this chronological walkthrough to demonstrate the full operational lifecycle of PharmaTrace AI across all six stakeholder portals.

---

### Step 1: System Governance & DGDA Administration
- **User:** `admin_m6@pharmatrace.test` (System Administrator)
- **Navigation:** Navigate to `http://localhost:5173/login/admin` and sign in.
- **Actions:**
  1. Observe the **Admin Dashboard** displaying live metrics for Total Organizations, Active Users, System Status, and Recent Administrative Actions.
  2. Navigate to **Organizations** in the drawer: inspect registered pharmaceutical manufacturers, distributors, wholesalers, and pharmacies.
  3. Navigate to **Users**: inspect user accounts, verify that password hashes are omitted, and review account lockout/active states.
- **Expected Outcome:** Administrator oversees system state with live audit trail records and zero hardcoded metrics.
- **Handoff:** Click the user avatar in the top-right and select **Logout**.

---

### Step 2: Regulatory Investigation & Automated Anomaly Detection
- **User:** `indep_officer_mwnog5r9@pharmatrace.test` (Regulatory Enforcement Officer)
- **Navigation:** Navigate to `http://localhost:5173/login/investigator` and sign in.
- **Actions:**
  1. Inspect the **Investigator Dashboard**: observe live detection metrics (Open Alerts, High Severity Alerts, Active Investigations, Tracked Packages, Quarantined Packages).
  2. Review the **Automated Detection Rules Engine**: inspect triggered alerts such as `SHIPMENT_QUANTITY_DISCREPANCY` and `CLONED_QR_SUSPECT`.
  3. Click **Traceability Search**: enter a package serial (e.g., `SN-NX-B26-01-00001`) to view its complete chronological custody timeline from manufacturing through pharmacy delivery.
  4. Inspect an open **Investigation Case**: review immutable evidence entries and audit logs.
- **Expected Outcome:** Field inspectors have comprehensive regulatory visibility across all supply chain tiers with tamper-proof audit trails.
- **Handoff:** Click **Logout**.

---

### Step 3: Manufacturing, QA Sign-Off & GS1 Package Serialization
- **User:** `mfg_user_m6@pharmatrace.test` (Manufacturer Representative — M6 Apex Pharma Ltd)
- **Navigation:** Navigate to `http://localhost:5173/login/manufacturer` and sign in.
- **Actions:**
  1. Observe the **Manufacturer Dashboard**: view live counts for Registered Products, Active Batches, Serialized Packages, and Outgoing Shipments.
  2. Navigate to **Batches**: observe production batch lifecycle (`Pending QA` $\to$ `Released`).
  3. Demonstrate serialization safety: serialization is strictly prevented until QA sign-off occurs.
  4. Once released, observe serialized packages with generated GS1-compliant DataMatrix and QR code payloads.
  5. Navigate to **Shipments $\to$ Dispatch**: initiate a new shipment targeting the Central Logistics Distributor (`org-m6-dist-dev`).
- **Expected Outcome:** Batches must pass authorized QA release before serial numbers can be generated; duplicate serial generation is strictly rejected at the database engine level.
- **Handoff:** Click **Logout**.

---

### Step 4: Central Logistics Receiving & Custody Intake
- **User:** `dist_user_dev@pharmatrace.test` (Distributor Lead — Central Logistics)
- **Navigation:** Navigate to `http://localhost:5173/login/distributor` and sign in.
- **Actions:**
  1. Observe the **Distributor Dashboard**: review live cards for Incoming Awaiting Intake, On-Hand Custody Inventory, and Outgoing Shipments.
  2. Navigate to **Incoming Shipments**: select the newly arrived shipment from M6 Apex Pharma.
  3. Open the **Itemized Receiving Modal**: record package dispositions:
     - Mark packages as `accepted` (transfers custody to Distributor).
     - Mark a discrepant package as `damaged` (immediately flags package as `quarantined`).
     - Mark a missing package as `missing` (retains custody at origin, requires reconciliation).
  4. Navigate to **Custody Inventory**: verify that accepted packages appear in active inventory, while damaged units are isolated in quarantine and blocked from further dispatch.
  5. Select eligible on-hand packages and dispatch an outgoing shipment to the Wholesale Depot.
- **Expected Outcome:** Package custody transfers occur transactionally; damaged units cannot enter commercial distribution channels.
- **Handoff:** Click **Logout**.

---

### Step 5: Wholesale Depot Custody Transfer & Dispatch
- **User:** `whol_user_dev@pharmatrace.test` (Wholesale Depot Manager)
- **Navigation:** Navigate to `http://localhost:5173/login/wholesaler` and sign in.
- **Actions:**
  1. Inspect the **Wholesaler Dashboard**: observe incoming shipment notifications from Central Logistics.
  2. Open **Incoming Shipments**: review shipment contents, verify sender identity, and confirm receipt.
  3. Inspect **Custody Inventory**: observe newly acquired packages ready for distribution.
  4. Create an outgoing shipment dispatching serialized packages to the Model Pharmacy (`org-pharm-dev`).
- **Expected Outcome:** Wholesaler acts as an intermediate custody tier, maintaining unbroken chain-of-custody provenance.
- **Handoff:** Click **Logout**.

---

### Step 6: Model Pharmacy Intake & Dispensing Verification
- **User:** `pharm_user_dev@pharmatrace.test` (Licensed Pharmacist — Model Pharmacy)
- **Navigation:** Navigate to `http://localhost:5173/login/pharmacy` and sign in.
- **Actions:**
  1. Observe the **Pharmacy Dashboard**: review live counts for Incoming Shipments Awaiting Intake, Ready in Stock, and Dispensed Units.
  2. Open **Incoming Shipments**: accept the incoming consignment from the Wholesaler.
  3. Inspect **Ready in Stock Inventory**: view package serial numbers and batch details.
  4. Review **Traceability & Safety Alerts**: verify that expired, quarantined, or recalled medicines trigger prominent visual safety warnings.
- **Expected Outcome:** Retail pharmacies maintain authentic stock with automated detection of questionable packs.

---

### Step 7: Public Verification & Consumer Transparency Portal
- **User:** Public Consumer / Healthcare Provider (Unauthenticated)
- **Navigation:** Open a new browser tab and navigate to:
  `http://localhost:5173/verify?serial=SN-NX-B26-01-00001`
- **Actions:**
  1. Inspect the verification dossier:
     - **Verification Status:** Marked as `Verified` (or `In Transit` / `Unshipped` depending on custody phase).
     - **Product Identification:** Generic name, brand name, strength, dosage form, and GS1 GTIN-14.
     - **Batch Telemetry:** Batch number, manufacturing date, and expiry date.
     - **Chain of Custody:** Chronological handoffs from Manufacturer $\to$ Distributor $\to$ Wholesaler $\to$ Pharmacy.
  2. Inspect the **Statutory DGDA Disclaimer**:
     > *"Digital verification confirms this package identifier is recorded in the DGDA-registered supply chain. A valid QR verification response does not constitute physical proof of chemical composition or physical pack authenticity. Always inspect tamper-evident seals, packaging integrity, and physical hologram before use."*
- **Expected Outcome:** Consumers receive instantaneous verification without misleading claims of physical molecular chemical proof.

---

### Step 8: Security Invariants & Cross-Role Access Denial
- **User:** `pharm_user_dev@pharmatrace.test` (Pharmacy Role)
- **Actions:**
  1. While logged in as the Pharmacy role, directly type `http://localhost:5173/admin/dashboard` in the browser address bar.
  2. Observe immediate access denial: the AppShell route guard detects role mismatch and redirects the browser to `/access-denied` (or `/login`).
  3. Attempt accessing API endpoints directly (e.g. `GET /api/v1/admin/dashboard/summary`): observe that the backend returns `403 Forbidden` with error code `FORBIDDEN_ROLE`.
- **Expected Outcome:** Role boundaries and tenant data isolation are unconditionally enforced at both UI routing and backend API levels.

---

## 3. Known Limitations & Architectural Scope

1. **Independent Machine Learning / AI Risk Engine:**
   - PharmaTrace AI core platform (M1–M9) implements deterministic, database-level statutory detection rules (duplicate scan anomalies, broken custody chains, shrinkage spikes, unauthorized custody activity).
   - Advanced machine learning predictive models and neural network diversion scoring represent an independent analytical module designed to ingest telemetry asynchronously without blocking runtime transactions.

2. **Regulatory Authority Disclaimer:**
   - PharmaTrace AI is a technology implementation demonstration and development platform. References to DGDA (Directorate General of Drug Administration) standards and guidelines reflect compliance modeling and architectural alignment, not an official government agency endorsement or production regulatory certification.
