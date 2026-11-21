# PharmaTrace AI — National Pharmaceutical Traceability, Verification & Regulatory Surveillance Platform

[![Node.js](https://img.shields.io/badge/Node.js-v24.18.0_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/en/about/previous-releases)
[![Express](https://img.shields.io/badge/Express-v4.21.2-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MariaDB](https://img.shields.io/badge/MariaDB-10.11_LTS_(mysql2)-003545?logo=mariadb&logoColor=white)](https://mariadb.org/)
[![React](https://img.shields.io/badge/React-v18.3.1-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-v5.3.1-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-v3.4.4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/M9_Full--Stack_Baseline-440_Passing_(100%25)-brightgreen?logo=node.js&logoColor=white)](#18-testing--quality-assurance-suite--m9-full-stack-baseline)
[![License](https://img.shields.io/badge/License-Academic_Capstone_Prototype-blue.svg)](#23-academic-capstone-context-regulatory-references--license)

> **Academic Prototype:** Enterprise-grade, multi-tenant pharmaceutical supply-chain traceability, GS1 DataMatrix serialization, multi-echelon custody transfer verification, and simulated regulatory enforcement system. Developed as an advanced university undergraduate capstone software engineering project.

---

## 2. Academic & Regulatory Disclaimer

> [!IMPORTANT]
> **ACADEMIC & REGULATORY DISCLAIMER:**
> 
> **1. Prototype Status & Non-Endorsement:**
> PharmaTrace AI is an academic software prototype developed solely for university capstone evaluation, systems research, and educational demonstration. It has **no formal endorsement, certification, accreditation, or legal authorization** from the Directorate General of Drug Administration (DGDA), Bangladesh, the Ministry of Health and Family Welfare, or any other government health authority. All regulatory workflows (DGDA Administration, Enforcement Wing) are simulated representations modeled on published regulatory guidelines.
> 
> **2. Digital vs. Chemical Verification:**
> Scanning a GS1 DataMatrix code on this platform verifies only that the digital serialization number exists within the central database and follows a compliant recorded custody progression. **Digital verification does not independently prove or guarantee the chemical purity, active pharmaceutical ingredient (API) concentration, sterility, or physical composition of the drug contents.** Physical testing requires accredited analytical laboratory chromatography (HPLC/GC-MS) under statutory regulatory protocols.
> 
> **3. GS1 Standards Independence:**
> Barcode rendering adheres to open GS1 DataMatrix symbology specifications and Application Identifiers (AI 01, 21, 17, 10). The platform is an independent academic software implementation with no formal GS1 certification.
> 
> **4. Synthetic & Demonstration Data:**
> All organization names, addresses, user profiles, tax identifiers, drug license numbers, and batch credentials referenced in this repository and documentation are synthetic demonstration fixtures created for automated testing and academic evaluation.

---

## 3. Executive Summary & Problem Statement

### The Counterfeit Medication Crisis
According to the World Health Organization (WHO), an estimated **1 in 10 medical products in low- and middle-income countries is substandard or falsified**, leading to tens of thousands of preventable deaths, treatment failures, antimicrobial resistance, and severe economic harm *(Source: World Health Organization. (2017). "WHO Global Surveillance and Monitoring System for substandard and falsified medical products." Geneva: World Health Organization. Licence: CC BY-NC-SA 3.0 IGO)*.

In traditional, un-serialized pharmaceutical distribution networks:
- Medicines are distributed without item-level serialization, making carton duplication undetectable.
- Custody handoffs rely on fragmented, alterable paper invoices with zero electronic verification.
- Intermediary gray-market wholesalers can inject diverted, stolen, or expired batches into licensed retail channels.
- Consumers and dispensing pharmacists possess zero tools to verify genuine provenance at the counter.
- Regulatory authorities lack real-time surveillance tools, discovering counterfeit incidents months after compromised drugs have already been consumed.

### The PharmaTrace AI Solution
PharmaTrace AI establishes an integrated, multi-echelon digital traceability network that enforces end-to-end serialized custody from factory packaging lines to retail pharmacy counters. By coupling GS1 DataMatrix 2D barcodes with immutable database triggers, role-based access control (RBAC), and deterministic anomaly screening, the platform guarantees that every medicine pack moving through the supply chain possesses a verifiable, tamper-evident custody trail.

---

## 4. Core Value Proposition & System Objectives

- **Item-Level GS1 Serialization:** Generates unique 2D DataMatrix identifiers combining GTIN-14, serial numbers, expiration dates, and batch codes directly in the browser via vector rendering (`bwip-js`).
- **Mandatory Quality Assurance Gating:** Batches cannot be serialized or dispatched without digital analytical QA release certification.
- **Unbroken Multi-Echelon Custody:** Enforces electronic shipping manifests and barcode intake verification across Manufacturer $\to$ Central Distributor $\to$ Wholesale Depot $\to$ Licensed Pharmacy.
- **Itemized Receiving Dispositions:** Supports granular package intake states (`ACCEPT`, `REJECT`, `DAMAGED_DISPOSITION`) with automatic quarantine isolation.
- **Open Public Verification:** Enables patients and healthcare workers to verify medicine authenticity and inspect the 7-stage custody timeline via smartphone cameras without requiring an account.
- **Real-Time Regulatory Surveillance:** Detects duplicate barcode scans, broken custody leaps, and transit anomalies in sub-milliseconds, arming investigators with court-admissible case dossiers (`INV-YYYY-XXXX`) and quarantine controls.
- **Immutable Audit Trails:** Nine MariaDB engine-level triggers strictly prohibit modification or deletion of historical custody transactions, security logs, or case evidence exhibits.

---

## 5. Complete System Architecture & High-Level Flowchart

PharmaTrace AI follows a decoupled multi-tier architecture engineered for high throughput, strict tenant isolation, and defense-in-depth security:

```mermaid
flowchart TB
    subgraph ClientTier["1. Presentation Tier (React 18.3 + Tailwind CSS + Vite 5)"]
        PublicApp["Public Verification Portal\n(Camera Barcode Scan & Timeline)\n[/verify]"]
        StakeholderApp["Stakeholder Portals\n(Mfg / Dist / Whol / Pharm)\n[AppShell + RoleGuard]"]
        RegulatoryApp["Simulated DGDA Regulatory Console\n(Admin & Investigator Portals)\n[Dossier Reviews & Forensic Feeds]"]
    end

    subgraph EdgeTier["2. Edge & Security Tier"]
        ReverseProxy["TLS 1.3 Reverse Proxy & Static CDN"]
        CSRFProtection["Double-Submit CSRF Verification\n(x-csrf-token)"]
    end

    subgraph ApiTier["3. Application Tier (Node.js 24.18.0 LTS + Express 4.21)"]
        direction TB
        HttpPipeline["Express Middleware Pipeline\n(Helmet, CORS, CookieParser, RequestLogger)"]
        AuthEngine["Authentication & RBAC Engine\n(Bcrypt cost 12, HttpOnly JWT, token_version)"]
        
        subgraph Services["Domain Service Modules"]
            RegSvc["Registration Service\n(Licensing Dossiers)"]
            MfgSvc["Manufacturer Service\n(GS1 DataMatrix, bwip-js)"]
            CustodySvc["Custody Engine\n(Intake Scans & Dispositions)"]
            PublicSvc["Public Verification Engine\n(Provenance Timeline)"]
            ScreenerSvc["Deterministic Heuristic Screener\n(5 Detection Rules: investigator.service.js)"]
            AdminSvc["DGDA Governance Service\n(Audit Trails & Account Lockouts)"]
        end
    end

    subgraph AITier["4. Future AI/ML Intelligence Tier (Python 3.11 + FastAPI)"]
        direction TB
        FastAPISvc["FastAPI Microservice (ai-service/)\n[Port 8000 · In Development Scaffold]"]
        GraphETL["Heterogeneous Graph ETL Pipeline\n(PyTorch Geometric HeteroData)"]
        GNNModel["Proposed Graph Neural Network (GNN)\n(Transductive & Inductive Fraud Detection)"]
        Explainer["Proposed GNNExplainer Subgraph Engine\n(Regulatory Case Exhibits)"]
    end

    subgraph PersistenceTier["5. Persistence & Immutability Tier (MariaDB 10.11)"]
        direction TB
        DBPool["Connection Pool (mysql2 connector)\n[Max 20 Connections, UTF8MB4]"]
        
        subgraph DBSchema["Relational Schema (26 Tables)"]
            TablesIdentity["Identity & Tenancy (organizations, users, tokens)"]
            TablesTrace["Traceability (products, batches, packages, shipments, traceability_events)"]
            TablesEnforce["Regulatory (investigation_alerts, cases, evidence, audit_logs)"]
        end
        
        Triggers["9 Immutability Triggers\n(PREVENT UPDATE / DELETE on Audit & Evidence)"]
    end

    %% Connections
    ClientTier --> EdgeTier
    EdgeTier --> CSRFProtection
    CSRFProtection --> HttpPipeline
    HttpPipeline --> AuthEngine
    AuthEngine --> Services

    Services -->|Dual-Account Runtime Least Privilege\nUser: pharmatrace_app (ZERO DELETE)| DBPool
    DBPool --> DBSchema
    DBSchema --- Triggers

    %% AI Bridge
    ScreenerSvc -.->|REST / Circuit Breaker Bridge\nFallback to Deterministic Screener| FastAPISvc
    FastAPISvc --> GraphETL
    GraphETL --> GNNModel
    GNNModel --> Explainer
    Explainer -.->|Proposed Inference Scores & Subgraphs| ScreenerSvc
```

*For comprehensive architectural analysis, consult the [System Architecture Guide](docs/architecture/system-architecture.md).*

---

## 6. Stakeholder Roles & Access Control Matrix

The platform orchestrates operations across **six canonical supply-chain stakeholder roles** plus unauthenticated public consumers:

| Role ID | Stakeholder Role | Workspace Portal | Primary Responsibilities & Permissions | Seed Demonstration Account |
| :---: | :--- | :--- | :--- | :--- |
| **`admin`** | **DGDA Administrator** | `/admin/dashboard` | System governance, reviewing organization licensing dossiers, managing category capacity quotas, user lockout resets, viewing platform-wide audit trails. | `admin_m6@pharmatrace.test` |
| **`investigator`**| **DGDA Enforcement Officer** | `/investigator/dashboard`| Real-time anomaly surveillance, duplicate scan triage, launching regulatory case dossiers (`INV-YYYY-XXXX`), evidence seizure, enforcing quarantine hold. | `indep_officer_mwnog5r9@pharmatrace.test` |
| **`manufacturer`**| **Pharmaceutical Manufacturer** | `/manufacturer/dashboard`| Registering medicine catalog (GTIN-14), batch production, QA analytical release sign-off, GS1 DataMatrix serialization, outbound logistics dispatch. | `mfg_user_m6@pharmatrace.test` |
| **`distributor`** | **Central Logistics Distributor** | `/distributor/dashboard`| Inbound intake scanning of factory shipments, itemized disposition (`ACCEPT`/`REJECT`/`DAMAGED`), quarantine holding, wholesale dispatch creation. | `dist_user_dev@pharmatrace.test` |
| **`wholesaler`** | **Wholesale Drug Depot** | `/wholesaler/dashboard`| Regional logistics intake, depot custody acceptance, inventory aggregation, fulfillment dispatches to retail community pharmacies. | `whol_user_dev@pharmatrace.test` |
| **`pharmacy`** | **Licensed Retail Pharmacy** | `/pharmacy/dashboard`| Model pharmacy receiving scans, ready stock inventory, safety alert monitoring, counter point-of-sale dispensing verification. | `pharm_user_dev@pharmatrace.test` |
| **`public`** | **Consumer / Patient** | `/verify` | Unauthenticated camera barcode scanning, verifying GTIN-14, inspecting 7-stage custody timeline, submitting consumer fraud reports. | *No login required* |

*Note: For security best practices in public documentation, seed credentials and demonstration account passwords are intentionally omitted from tracked repository documentation. Demonstration accounts and local testing credentials are configured internally via local environment variables.*

---

## 7. End-to-End Pharmaceutical Supply Chain Lifecycle

The operational lifecycle tracks pharmaceutical units from initial product registration through multi-echelon logistics to consumer verification:

```mermaid
flowchart TD
    subgraph Step1["Stage 1: Manufacturer Production"]
        A1[Register Medicine: Napa Extra\nAssign GTIN-14] --> A2[Create Batch B26-01\nMfg Date & Exp Date]
        A2 --> A3{QA Analytical Release}
        A3 -->|Pass| A4[Allocate GS1 Serials\nRender DataMatrix via bwip-js]
        A3 -->|Fail| A5[Batch Quarantined]
    end

    subgraph Step2["Stage 2: Central Distribution"]
        A4 --> B1[Outbound Dispatch Manifest]
        B1 --> B2[Carrier Transit to Central Hub]
        B2 --> B3[Inbound Intake Scan]
        B3 --> B4{Item Receiving Disposition}
        B4 -->|Intact| B5[Accept into Active Inventory]
        B4 -->|Seal Broken| B6[Automated Quarantine Hold]
    end

    subgraph Step3["Stage 3: Wholesale Depot"]
        B5 --> C1[Wholesale Dispatch Manifest]
        C1 --> C2[Regional Depot Inbound Scan]
        C2 --> C3[Depot Inventory Intake]
    end

    subgraph Step4["Stage 4: Retail Pharmacy"]
        C3 --> D1[Retail Pharmacy Dispatch]
        D1 --> D2[Pharmacy Inbound Intake Scan]
        D2 --> D3[Verified Shelf Stock]
    end

    subgraph Step5["Stage 5: Consumer & Regulatory"]
        D3 --> E1[Patient Scans 2D Barcode at Counter]
        E1 --> E2{Public Verification Engine}
        E2 -->|Unbroken Custody| E3[VERIFIED: Green Badge\nDisplay 7-Stage Provenance]
        E2 -->|Duplicate / Diverted| E4[Anomaly Flagged\nAuto-Flag to DGDA Investigator]
        E4 --> E5[Investigator Assembles Case Dossier\nEnforces Facility / Batch Quarantine]
    end
```

---

## 8. Key Implemented Capabilities by Milestone

PharmaTrace AI was engineered across nine rigorous milestone deliveries:

- **Milestone 1 (Foundation & Database):** Initial relational schema, forward migrations engine, MariaDB connection pooling, base tables for organizations, users, and audit logs.
- **Milestone 2 (Authentication & Tenancy):** Native Bcrypt password hashing (cost 12), HttpOnly secure cookie JWT handling, multi-tenant organization scoping, CSRF double-submit protection.
- **Milestone 3 (Public Onboarding & Governance):** Self-service organization registration (`/register`), PDF licensing dossier upload, tracking codes, DGDA administrator approval queue.
- **Milestone 4 (Product Registry & QA Release):** Master medicine catalog, GTIN-14 constraints, production batch lifecycles, analytical laboratory QA certification sign-off.
- **Milestone 5 (GS1 DataMatrix Serialization):** Item-level serial generation, GS1 Application Identifiers (AI 01, 21, 17, 10), vector barcode rendering with `bwip-js`.
- **Milestone 6 (Administrative Security & Licensing Dossier Viewer):** In-browser document preview modal for drug licenses, user security administration drawer, Bcrypt hash auditing, account lockout resets.
- **Milestone 7.1 (Two-Step Authentication & UX Correction):** Role-selection landing view, role-mismatch rejection, session revocation via `token_version`.
- **Milestone 7.2 (Model Pharmacy Dispensing & Inventory):** Community pharmacy portal, barcode scanner integration, point-of-sale package verification.
- **Milestone 7.3 (Multi-Echelon Custody & Dispositions):** Central Distributor and Wholesale Depot portals, inbound intake scanning, receiving dispositions (`ACCEPT`, `REJECT`, `DAMAGED_DISPOSITION`), automated quarantine routing.
- **Milestone 8 (Regulatory Enforcement & Anomaly Feeds):** Real-time surveillance dashboard, deterministic heuristic screener (Rules 1–5), case dossier builder (`INV-YYYY-XXXX`), court-admissible evidence hashing, batch quarantine controls.
- **Milestone 9 (System Integration & Verification):** Complete cross-role integration, 8-stage browser verification with 25 evidence captures, bundle profiling, test database isolation harness (M9 full-stack baseline: 440 passing tests, AI service tests excluded).

---

## 9. Multi-Tier Technology Stack

| Layer | Technology | Exact Version | Purpose & Architectural Role |
| :--- | :--- | :---: | :--- |
| **Frontend Framework** | React | `^18.3.1` | Declarative UI rendering, form state management, component tree. |
| **Build Tooling** | Vite | `^5.3.1` | Fast HMR development server, Rollup production bundling. |
| **Client Routing** | React Router DOM | `^6.26.0` | Single-page application routing, `RoleGuard`, `AuthGuard`. |
| **CSS & Design System** | Tailwind CSS | `^3.4.4` | Utility-first responsive styling, clinical design system. |
| **Barcode Rendering** | `bwip-js` | `^4.11.4` | Client-side GS1 DataMatrix vector SVG/PNG rendering engine. |
| **Iconography** | `lucide-react` | `^0.383.0` | Accessible SVG iconography for dashboards and navigation. |
| **Charts** | `recharts` | `^2.12.7` | Analytics data visualization in administrative dashboards. |
| **Camera Scanner** | `html5-qrcode` | `^2.3.8` | In-browser video camera barcode scanning. |
| **Backend Runtime** | Node.js | `v24.18.0` LTS | Verified baseline runtime environment ([Node.js Release Schedule](https://nodejs.org/en/about/previous-releases)). Node 26 supported as an alternative after compatibility testing; Node 20 is EOL and not recommended. |
| **Backend Framework** | Express | `^4.21.2` | RESTful routing, middleware pipeline, controller coordination. |
| **Database Engine** | MariaDB Server | `10.11.16` LTS| Relational persistence, ACID transactions, 9 immutability triggers. |
| **Database Connector** | `mysql2` | `^3.12.0` | High-performance MariaDB driver, connection pooling, prepared statements. |
| **Password Security** | `bcrypt` (native) | `^6.0.0` | Adaptive cryptographic password hashing with cost factor 12. |
| **Session Security** | `jsonwebtoken` | `^9.0.3` | Cryptographic JWT signing with `token_version` revocation. |
| **Rate Limiting** | `express-rate-limit`| `^8.7.4` | Rate-limiting middleware protecting public verification endpoints. |
| **Test Runner** | Node.js Test Runner | Native (`--test`)| Built-in Node test runner executing isolated database regression tests. |
| **Future AI Microservice** | Python & FastAPI | `3.11+` | Autonomous microservice scaffold for Graph Neural Networks. |

---

## 10. Database Schema, Migrations & Immutability Architecture

The persistence tier comprises **26 normalized tables** governed by **28 sequential forward migrations** in `server/src/database/migrations/`:

```
server/src/database/migrations/
├── 001_create_schema_migrations.sql                ├── 015_create_government_allocation_documents.sql
├── 002_create_category_policies.sql                ├── 016_create_packages.sql
├── 003_create_organizations.sql                    ├── 017_create_shipments_and_packages.sql
├── 004_create_users.sql                            ├── 018_create_traceability_events.sql
├── 005_add_org_verification_fk.sql                 ├── 019_create_investigation_alerts.sql
├── 006_create_organization_registrations.sql       ├── 020_create_public_reports_and_attachments.sql
├── 007_create_registration_documents.sql           ├── 021_seed_category_policies.sql
├── 008_create_registration_access_tokens.sql       ├── 022_add_user_security_columns.sql
├── 009_create_activation_tokens.sql                ├── 023_create_admin_audit_log.sql
├── 010_create_registration_submissions.sql         ├── 024_enforce_admin_audit_log_immutability.sql
├── 011_create_registration_audit_log.sql           ├── 025_create_user_security_audit_log.sql
├── 012_create_products.sql                         ├── 026_add_gtin_to_products.sql
├── 013_create_batches.sql                          ├── 027_create_investigation_cases_and_evidence.sql
└── 014_create_government_allocations.sql           └── 028_protect_investigation_cases_and_evidence.sql
```

### 9 Engine-Level Immutability Triggers
To enforce zero-tamper regulatory compliance, MariaDB triggers intercept illicit `UPDATE` or `DELETE` attempts on sensitive tables and abort them with `SQLSTATE '45000'`:
1. `trg_admin_audit_log_prevent_update` & `trg_admin_audit_log_prevent_delete` on `admin_audit_log`.
2. `trg_user_security_audit_log_prevent_update` & `trg_user_security_audit_log_prevent_delete` on `user_security_audit_log`.
3. `trg_investigation_evidence_prevent_update` & `trg_investigation_evidence_prevent_delete` on `investigation_evidence`.
4. `trg_investigation_case_audit_log_prevent_update` & `trg_investigation_case_audit_log_prevent_delete` on `investigation_case_audit_log`.
5. Immutability protection on permanent chain-of-custody event records in `traceability_events`.

### Dual-Account Least-Privilege Security Model
- **`pharmatrace_app` (Runtime API):** Possesses `SELECT` on all tables, and explicit `INSERT`/`UPDATE` on business tables. **`DELETE` privileges are revoked platform-wide.**
- **`pharmatrace_migrator` (Maintenance):** Dedicated account reserved for migrations and automated test database resets.

*For complete schema documentation, consult the [Database Architecture Guide](docs/architecture/database-architecture.md).*

---

## 11. Cryptographic Serialization & GS1 DataMatrix Standards

PharmaTrace AI serializes medicines at the unit-carton level conforming to open **GS1 General Specifications**:

$$\text{DataMatrix Payload} = \text{(01)}\text{GTIN-14} + \text{(21)}\text{Serial} + \text{(17)}\text{YYMMDD} + \text{(10)}\text{Batch}$$

```
┌────────────────────────────────────────────────────────┐
│  GS1 DataMatrix (2D)          Human-Readable Text (HRI)│
│  ┌──────────┐                 GTIN:   010890123456789  │
│  │ █▀▀▀▀▀█  │                 SN:     SN-NX-B26-01-0001│
│  │ █ ███ █  │                 EXP:    28-11-30         │
│  │ ▀▀▀▀▀▀▀  │                 LOT:    B26-01           │
│  └──────────┘                 Apex Pharma Ltd · DGDA   │
└────────────────────────────────────────────────────────┘
```

- **Application Identifiers (AI):** AI(01) for GTIN-14, AI(21) for item serial number, AI(17) for expiration date, AI(10) for production batch.
- **Client-Side Vector Engine:** Generated via `bwip-js` in the browser, producing vector SVG or high-resolution PNG labels with zero external third-party dependencies.

*For packaging workflows, consult the [Manufacturer & Serialization Guide](docs/workflows/manufacturer-and-serialization.md).*

---

## 12. Custody Transfer, Inbound Intake & Receiving Dispositions

In-transit pharmaceuticals require continuous physical and electronic verification:
1. **Shipping Manifests:** Outbound shipments bind specific serialized packages to recipient organizations.
2. **Barcode Intake Scans:** Receiving clerks scan physical cartons on arrival; the system reconciles scanned serials against the digital manifest in real time.
3. **Receiving Dispositions:**
   - **`ACCEPT`:** Pristine cartons added to active stock (`status = 'available'`).
   - **`REJECT`:** Mismatched or unmanifested cartons rejected back to sender (`status = 'rejected'`).
   - **`DAMAGED_DISPOSITION`:** Crushed or unsealed cartons automatically routed to quarantine holding (`status = 'quarantined'`), permanently preventing sale or dispensing.

*For logistics protocols, consult the [Shipment & Custody Guide](docs/workflows/shipment-and-custody.md).*

---

## 13. Public Verification Journey & Consumer Transparency

Patients, consumers, and dispensing pharmacists access `/verify` without authentication:
- **Dual Verification:** Users can scan the 2D DataMatrix code using their device camera or manually input the serial number.
- **Implemented Verification States (`verification.service.js`):**
  - `verified`: Package matches a recorded, unbroken supply-chain journey.
  - `expired`: Package is past its expiration date.
  - `quarantined`: Package has been quarantined due to a quality or damage report.
  - `rejected`: Package was rejected during regulatory review or receiving inspection.
  - `dispensed`: Package was previously recorded as dispensed.
  - `unshipped`: Serial registered to manufacturer but not yet dispatched into distribution channels.
  - `missing`: Package was recorded as missing during transit receiving reconciliation.
  - `in_transit`: Package is currently in transit within the authorized supply chain.
  - `notFound`: Identifier could not be found in the registry.
- **7-Stage Chronological Provenance:** Verified packages display an interactive timeline tracing the physical unit from factory QA release, central logistics intake, wholesale depot storage, to retail pharmacy delivery.
- **Fraud Reporting:** Direct reporting interface allowing consumers to submit photos and details of suspected counterfeit packaging for investigator review.

*For consumer journeys, consult the [Public Verification Guide](docs/workflows/public-verification.md).*

---

## 14. Regulatory Enforcement, Heuristic Anomaly Detection & Dossiers

The platform's surveillance engine combines real-time screening with legal enforcement tools:

### Five Core Deterministic Screening Rules (`investigator.service.js`)
1. **`DUPLICATE_SCAN_ANOMALY`:** Detects packages with repeated verification scans (`verify_count > 1`, severity `HIGH`). Notes that repeated scans are operational screening indicators and that network/IP diversity does not prove disparate physical locations.
2. **`SHIPMENT_QUANTITY_DISCREPANCY` / `SHRINKAGE_SPIKE`:** Detects shipments containing packages with missing, damaged, or rejected dispositions, distinguishing numerical shortages from physical damage.
3. **`GOVERNMENT_DIVERSION_INDICATOR`:** Detects government-allocated healthcare packages appearing in commercial retail pharmacies or consumer fraud reports (severity `CRITICAL` / `HIGH`).
4. **`BROKEN_CUSTODY_HISTORY` / `SHADOW_DIVERSION_RISK`:** Detects packages held by wholesalers or pharmacies without prerequisite upstream `DISPATCHED` or `RECEIVED` traceability events.
5. **`UNAUTHORIZED_CUSTODY_ACTIVITY`:** Detects quarantined or rejected packages that are illicitly assigned to active shipment manifests.

### Regulatory Enforcement Powers
- **Formal Case Files (`INV-YYYY-XXXX`):** Lead investigators bind suspect organizations, attach evidence exhibits, record findings, and track progress through an immutable audit trail (`investigation_case_audit_log`).
- **Quarantine Enforcement:** One-click batch and package quarantine transitions restrict suspect inventory from commercial movement. (Proposed capability: Automated nationwide emergency recall broadcasts).

*For enforcement workflows, consult the [Investigation & Enforcement Guide](docs/workflows/investigation-and-enforcement.md).*

---

## 15. Comprehensive Security Architecture & Threat Defense

PharmaTrace AI implements a defense-in-depth security model:
- **Native Bcrypt Hashing:** Passwords hashed with `bcrypt` (cost factor 12) with constant-time dummy hash evaluation preventing timing attacks on non-existent accounts.
- **Zero LocalStorage Tokens:** Authentication managed exclusively via secure, `HttpOnly`, `SameSite=Strict` cookies (`pt_access_token`).
- **Double-Submit CSRF Protection:** Cryptographic `pt_csrf_token` cookie and `x-csrf-token` header validation on all state-changing API endpoints.
- **Instant Revocation via `token_version`:** Changing passwords or administrative suspensions increments `token_version`, immediately revoking active sessions globally.
- **Account Lockout:** Locks accounts after consecutive failed login attempts.
- **Client Route Interception:** `RoleGuard` and `AuthGuard` prevent cross-role URL tampering, redirecting unauthorized users to `/access-denied`.

*For detailed security analysis, consult the [Security Architecture Guide](docs/security/security-architecture.md).*

---

## 16. Frontend Architecture & Design System

The frontend web application (`client/`) is built on React 18.3 and Vite 5:
- **Modular Feature Architecture:** Domain folders (`admin/`, `manufacturer/`, `distributor/`, `wholesaler/`, `pharmacy/`, `investigator/`, `public-verification/`).
- **Unified Application Shell (`AppShell`):** Role-aware sidebars, responsive viewports, breadcrumbs, live session indicators, and toast notification drawers.
- **Bundle Profile:** Profiled under Vite at ~2,116 KB uncompressed (~566 KB gzip), with ~864 KB accounted for by `bwip-js` vector barcode rendering tables.

*For frontend design patterns, consult the [Frontend Architecture Guide](docs/architecture/frontend-architecture.md).*

---

## 17. Backend Architecture & Modular Services

The backend server (`server/`) follows a clean layered service-controller pattern in Node.js 24.18.0 LTS:
- **Controllers (`controllers/`):** Request parsing, HTTP status coordination, and standardized JSON envelopes.
- **Services (`services/`):** Transaction boundaries, database queries, and business logic invariants.
- **Middleware Pipeline:** `helmet`, `corsMiddleware`, `cookieParser`, `express.json`, `requestLogger`, `authMiddleware`, `rbacMiddleware`, `errorHandler`.

*For backend service patterns, consult the [Backend Architecture Guide](docs/architecture/backend-architecture.md).*

---

## 18. Testing & Quality Assurance Suite — M9 Full-Stack Baseline

Quality assurance for the **Milestone 9 Full-Stack Baseline** is verified through **440 automated tests with a 100% pass rate** executing via the native Node.js test runner:

```
================================================================================
PHARMATRACE AI — M9 FULL-STACK BASELINE TEST EXECUTION SUMMARY
================================================================================
Test Domain             Test Runner       Suites   Tests   Pass Rate   Duration
--------------------------------------------------------------------------------
Backend API & Services  Node.js --test      75      316      100%       ~18.4s
Frontend UI Components  Node.js --test      14      124      100%        ~4.8s
--------------------------------------------------------------------------------
TOTAL M9 FULL-STACK BASELINE                89      440      100%       ~23.2s
================================================================================
```

> [!NOTE]
> **Scope Notice:** The 440 passing tests above measure the complete, operational Milestone 9 full-stack implementation (Express API, MariaDB, React 18). The separate, in-progress AI/ML microservice (located in `ai-service/`) is under active development by the dedicated AI teammate and is **strictly excluded from this baseline test count**.

### Running the M9 Test Suites
```bash
# Run Backend Test Suite (316 tests across 75 suites in server/tests/)
cd server && npm test

# Run Frontend Test Suite (124 tests across 14 suites in client/tests/)
cd client && npm test
```

*For testing architecture and database isolation details, consult the [Testing & Quality Assurance Guide](docs/testing/testing-and-quality-assurance.md).*

---

## 19. Visual Gallery & Live Application Screenshots

All screenshots below represent genuine operational states verified during live system audits. A complete catalog with UI breakdown is maintained in the [Visual Application Gallery](docs/screenshots/README.md).

### 1. Two-Step Authentication & Stakeholder Role Selection
![Role Selection Login](docs/assets/screenshots/01-role-selection-login.png)

### 2. DGDA Administrator Dashboard & System Governance
![Admin Dashboard Overview](docs/assets/screenshots/02-admin-dashboard-overview.png)

### 3. Administrator Licensing Dossier Inspection Modal
![Admin Licensing Dossier Preview](docs/assets/screenshots/03-admin-licensing-dossier-preview.png)

### 4. User Security Administration & Bcrypt Audit
![Admin Users Security Audit](docs/assets/screenshots/04-admin-users-security-audit.png)

### 5. Pharmaceutical Manufacturer Portal & Batch Lifecycle
![Manufacturer Dashboard Lifecycle](docs/assets/screenshots/05-manufacturer-dashboard-lifecycle.png)

### 6. GS1 DataMatrix Serialization Registry & Batch Allocation
![Manufacturer Batch Serialization](docs/assets/screenshots/06-manufacturer-batch-serialization.png)

### 7. Central Logistics & Distributor Operations Portal
![Distributor Dashboard Logistics](docs/assets/screenshots/07-distributor-dashboard-logistics.png)

### 8. Distributor Inbound Shipment Intake & Custody Acceptance
![Distributor Intake Custody](docs/assets/screenshots/08-distributor-intake-custody.png)

### 9. Wholesale Drug Depot Management Dashboard
![Wholesaler Dashboard Depot](docs/assets/screenshots/09-wholesaler-dashboard-depot.png)

### 10. Wholesaler Receiving Scan & Inventory Disposition
![Wholesaler Intake Inventory](docs/assets/screenshots/10-wholesaler-intake-inventory.png)

### 11. Licensed Model Pharmacy Portal & Dispensing Stock
![Pharmacy Dashboard Inventory](docs/assets/screenshots/11-pharmacy-dashboard-inventory.png)

### 12. Pharmacy Stock Receiving & Barcode Verification
![Pharmacy Stock Intake](docs/assets/screenshots/12-pharmacy-stock-intake.png)

### 13. Public Consumer Verification Portal — Verified Product
![Public Verification Result](docs/assets/screenshots/13-public-verification-result.png)

### 14. Public Verification — Chronological Custody Chain
![Public Verification Timeline](docs/assets/screenshots/14-public-verification-timeline.png)

### 15. DGDA Regulatory Enforcement Dashboard & Anomaly Feed
![Investigator Dashboard Overview](docs/assets/screenshots/15-investigator-dashboard-overview.png)

### 16. Live Anomaly Alert Details & Triage Drawer
![Investigator Alert Details Drawer](docs/assets/screenshots/16-investigator-alert-details-drawer.png)

### 17. Formal Investigation Case Dossier & Immutable Audit Trail
![Investigator Case Audit Trail](docs/assets/screenshots/17-investigator-case-audit-trail.png)

### 18. Package Forensic Trace & Deep Custody Timeline
![Investigator Custody Timeline](docs/assets/screenshots/18-investigator-custody-timeline.png)

### 19. Security Enforcement — Cross-Role Privilege Escalation Interception
![Security Cross-Role Access Denied](docs/assets/screenshots/19-security-cross-role-access-denied.png)

---

## 20. Planned AI/ML Module & Research Roadmap

> [!NOTE]
> **AI/ML TEAMMATE ATTRIBUTION & SCOPE:**
> The advanced AI/ML research and model implementation is being conducted separately by the dedicated AI/ML engineer on the team. The repository scaffolding for this work was initialized at `ai-service/` under branch `ai-module`. The core full-stack platform (M1–M9) is 100% operational and functions autonomously via deterministic heuristic screening.

### Graph Neural Network (GNN) Research Roadmap
To extend anomaly detection beyond fixed heuristic rules to complex topological fraud syndicates:
1. **Heterogeneous Graph Construction:** Modeling organizations, batches, unit packages, and scans as heterogeneous nodes and temporal edges in PyTorch Geometric.
2. **Proposed Graph Attention Networks (HAN / HGT):** Applying node-level and semantic-level attention over supply-chain metapaths to detect laundering subgraphs.
3. **Synthetic Topological Fraud Generators:** Synthesizing complex diversion motifs (cloning networks, multi-hop shell rings, phantom splits).
4. **FastAPI Serving & Circuit Breaker Bridge:** Exposing predictions via `POST /v1/predict/anomaly`, with an Express Circuit Breaker that falls back seamlessly to deterministic rules if the AI microservice is offline.

*For complete AI research documentation, consult the [AI Research Index](docs/ai/README.md).*

---

## 21. Installation, Environment & Local Deployment Guide

### Prerequisites
- Node.js v24.18.0 LTS (verified baseline; Node 26 supported after compatibility verification; Node 20 is EOL), npm 10+, MariaDB Server 10.11+ LTS, Git.

### Step 1: Clone Repository
```bash
git clone https://github.com/MarwanHossain/Pharmatrace-ai.git
cd Pharmatrace-ai
```

### Step 2: Configure Environment Files
- Copy `server/.env.example` to `server/.env`.
- Copy `client/.env.example` to `client/.env`.
- Configure your local database credentials and JWT signing secret in `server/.env`.
- Ensure MariaDB is running on `127.0.0.1:3306`.

### Step 3: Initialize Database & Run Migrations
```bash
cd server
npm install
npm run migrate
```

### Step 4: Start Backend API Server
```bash
# In server/ directory:
npm run dev
# Server listening on http://localhost:5000 (Health check: /api/v1/health)
```

### Step 5: Start Frontend Client
```bash
# In a new terminal, in client/ directory:
cd ../client
npm install
npm run dev
# Vite client ready at http://localhost:5173
```

*For complete installation troubleshooting and test database isolation commands, consult the [Local Development Guide](docs/installation/local-development.md).*

---

## 22. Project Documentation Directory Index

PharmaTrace AI includes comprehensive, dedicated documentation across eight specialized directories:

| Documentation Section | File Path | Scope & Core Contents |
| :--- | :--- | :--- |
| **System Architecture** | [`docs/architecture/system-architecture.md`](docs/architecture/system-architecture.md) | Multi-tier topology, Mermaid flowcharts, sequence diagrams, hardware specs. |
| **Frontend Architecture**| [`docs/architecture/frontend-architecture.md`](docs/architecture/frontend-architecture.md) | React 18.3 SPA, Vite build, Tailwind design system, RouteGuards, `bwip-js`. |
| **Backend Architecture** | [`docs/architecture/backend-architecture.md`](docs/architecture/backend-architecture.md) | Node.js Express services, controllers, middleware pipeline, transactions. |
| **Database Architecture**| [`docs/architecture/database-architecture.md`](docs/architecture/database-architecture.md) | MariaDB schema (26 tables), 28 migrations, 9 immutability triggers, pooling. |
| **Org Registration** | [`docs/workflows/organization-registration.md`](docs/workflows/organization-registration.md) | Self-service onboarding, licensing dossier upload, DGDA review modal. |
| **Mfg & Serialization** | [`docs/workflows/manufacturer-and-serialization.md`](docs/workflows/manufacturer-and-serialization.md) | Medicine catalog, batch QA release sign-off, GS1 DataMatrix generation. |
| **Shipment & Custody** | [`docs/workflows/shipment-and-custody.md`](docs/workflows/shipment-and-custody.md) | Multi-echelon logistics, intake scans, receiving dispositions, quarantine hold. |
| **Public Verification** | [`docs/workflows/public-verification.md`](docs/workflows/public-verification.md) | Consumer QR scan journey, 7-stage timeline, fraud reporting, disclaimers. |
| **Anomaly Detection** | [`docs/workflows/anomaly-detection.md`](docs/workflows/anomaly-detection.md) | Deterministic heuristic rules (1–5), scoring matrix, real-time alert feed. |
| **Enforcement & Cases** | [`docs/workflows/investigation-and-enforcement.md`](docs/workflows/investigation-and-enforcement.md) | DGDA enforcement portal, case dossiers, evidence hashing, quarantine controls. |
| **Security Architecture**| [`docs/security/security-architecture.md`](docs/security/security-architecture.md) | Native Bcrypt hashing, HttpOnly JWT, `token_version`, CSRF defense, RBAC matrix. |
| **API Reference** | [`docs/api/api-overview.md`](docs/api/api-overview.md) | REST API endpoints, JSON request/response envelopes, status codes. |
| **Local Development** | [`docs/installation/local-development.md`](docs/installation/local-development.md) | Prerequisites, database provisioning, environment variables, startup commands. |
| **Testing & QA** | [`docs/testing/testing-and-quality-assurance.md`](docs/testing/testing-and-quality-assurance.md) | M9 full-stack baseline (440 automated tests, AI service excluded), test database isolation harness, coverage standards. |
| **AI Research Index** | [`docs/ai/README.md`](docs/ai/README.md) | Navigation index to all four AI/ML research and integration guides. |
| **AI Methodology** | [`docs/ai/research-methodology.md`](docs/ai/research-methodology.md) | Graph anomaly detection problem formulation, hypotheses, literature review. |
| **AI Dataset Strategy** | [`docs/ai/dataset-strategy.md`](docs/ai/dataset-strategy.md) | Relational-to-graph ETL pipeline, synthetic fraud topologies, temporal split. |
| **AI Model Architecture**| [`docs/ai/model-architecture.md`](docs/ai/model-architecture.md) | Heterogeneous GNN formulation, focal loss, target benchmarks, GNNExplainer. |
| **AI FastAPI Bridge** | [`docs/ai/fastapi-integration.md`](docs/ai/fastapi-integration.md) | FastAPI microservice schema, REST contract, Circuit Breaker fallback. |
| **Visual Gallery** | [`docs/screenshots/README.md`](docs/screenshots/README.md) | Comprehensive catalog and detailed UI breakdown of all 19 verified screens. |

---

## 23. Academic Capstone Context, Regulatory References & License

### Academic Capstone Project
PharmaTrace AI was designed and developed as a university undergraduate capstone project in Software Engineering and Computer Science. It demonstrates the application of distributed software architecture, cryptographic serialization, database trigger immutability, role-based security, and graph representation learning to solve life-critical supply-chain integrity challenges.

### Team Division of Responsibilities
- **Full-Stack Software Architecture, Backend, Database, Security & Frontend (Milestones M1–M9):**
  Lead Full-Stack Engineer — System architecture, Express REST API, MariaDB schema, 28 forward migrations, 9 immutability triggers, React 18 UI, GS1 DataMatrix integration, multi-echelon custody workflows, and test database isolation suite (M9 full-stack baseline: 440 passing tests, AI service tests excluded).
- **Advanced Artificial Intelligence & Graph Representation Learning (`ai-service/`):**
  AI/ML Teammate — Graph neural network research, continuous-time temporal graph modeling, synthetic fraud topological generator, and FastAPI microservice integration.

### Regulatory and Standards References
- **Directorate General of Drug Administration (DGDA), Bangladesh:** Regulatory frameworks, Good Distribution Practices (GDP), and statutory drug registration guidelines published by the DGDA served as external regulatory models for designing the simulated workflows. No formal affiliation, authorization, or endorsement exists.
- **GS1 Global Standards:** Open GS1 General Specifications, Application Identifier (AI) standards, and 2D DataMatrix barcode encoding specifications served as technical reference standards for unit serialization. No formal GS1 certification is held.
- **Academic Project Reviewers & Supervisors:** For academic supervision, feedback, and milestone evaluations throughout this university capstone project.

### License & Intellectual Property Notice
This project is an **academic software engineering prototype**. Formal open-source licensing assignment (e.g. MIT) is pending final university capstone clearance and repository release.
All regulatory names, logos, and trademarks referenced are the property of their respective holders and are utilized strictly under academic fair-use guidelines for educational and evaluative purposes.
