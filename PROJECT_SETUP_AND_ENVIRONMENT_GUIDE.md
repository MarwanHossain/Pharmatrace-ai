# PharmaTrace AI — Project Setup, Environment & Deployment Guide

**Version:** 1.0.0 (Milestone M9 Final Delivery)  
**Target Environment:** Windows 11 / PowerShell / Node.js 24.18.0 / MariaDB 10.11.16  
**Repository Branch:** `phase-2-authentication`  

---

## 1. System Requirements & Prerequisites

PharmaTrace AI is built as a hardened, high-integrity pharmaceutical supply chain traceability platform conforming to Bangladesh DGDA (Directorate General of Drug Administration) regulatory compliance requirements.

| Component | Minimum Specification | Installed Development Version | Notes |
| :--- | :--- | :--- | :--- |
| **Operating System** | Windows 10/11 x64 or Linux | Windows 11 x64 (PowerShell 7+) | Native Windows terminal commands |
| **Node.js Runtime** | Node.js v20.x or v24.x | `v24.18.0` | Uses native Node.js `--test` runner and `--env-file` |
| **MariaDB Database** | MariaDB 10.11 LTS | `10.11.16-MariaDB` | Installed standalone at `D:\Server\mysql` |
| **Web Browser** | Modern Chromium / Firefox | Chrome / Edge | Responsive UI with HTML5 QR scanner & SVG rendering |

---

## 2. Directory Structure

```
D:\pharmatrace-ai\
├── client\                           # Vite + React 18 Single Page Application
│   ├── src\
│   │   ├── api\                      # Axios/Fetch API client wrappers with CSRF injection
│   │   ├── features\                 # Role-specific modules & dashboards
│   │   │   ├── admin\                # DGDA Administrator Portal & Organization Registry
│   │   │   ├── investigator\         # Field Inspection, Alert Triage & Case Dossiers
│   │   │   ├── manufacturer\         # Batch QA Release, Serialization & Dispatch
│   │   │   ├── distributor\          # Intake Receiving, Quarantine & Custody Dispatch
│   │   │   ├── wholesaler\           # Regional Depot Receiving & Pharmacy Dispatch
│   │   │   ├── pharmacy\             # Model Pharmacy Intake, Safety Alerts & Stock
│   │   │   └── verification\         # Public QR/DataMatrix Verification & Traceability
│   │   ├── layouts\                  # AppShell.jsx with live session RBAC guards
│   │   └── context\                  # AuthContext with HttpOnly session state
│   ├── tests\                        # Client-side component & regression tests (14 suites)
│   └── package.json                  # Scripts: dev (port 5173), build, test
├── server\                           # Express 4 Backend REST API
│   ├── src\
│   │   ├── config\                   # database.js, env.js (safety guard), security.js
│   │   ├── controllers\              # REST API controllers across all domains
│   │   ├── database\
│   │   │   ├── migrations\           # Deterministic migrations (001 through 028)
│   │   │   ├── migrator.js           # Migration runner and test isolation checker
│   │   │   └── migrate.js            # CLI migration command
│   │   ├── middleware\               # auth.js (token_version checks), csrf.js, cors.js
│   │   ├── routes\                   # Versioned REST route definitions (/api/v1/...)
│   │   ├── services\                 # MariaDB transaction-backed business engines
│   │   └── utils\                    # tokens.js (JWT), datamatrix.js (GS1 SVG), logger.js
│   ├── tests\                        # Node native test runner suites (75 suites, 316 tests)
│   ├── .env.example                  # Template configuration file
│   └── package.json                  # Scripts: start, dev, test, test:migrate
├── PROJECT_SETUP_AND_ENVIRONMENT_GUIDE.md  # Setup & operational architecture
└── FINAL_DEMONSTRATION_GUIDE.md      # 8-step stakeholder workflow demonstration
```

---

## 3. Database Architecture & User Permissions

PharmaTrace AI enforces database-level defense-in-depth through least-privilege database user separation across two isolated MariaDB databases.

### 3.1 Dual-Database Strategy

1. **`pharmatrace_ai` (Development / Runtime Database):**
   - Holds persistent development data, approved canonical stakeholder accounts, and regulatory audit logs.
   - Preserved across all automated testing runs.

2. **`pharmatrace_ai_test` (Automated Testing Database):**
   - Exclusively targeted when `NODE_ENV=test`.
   - Hard safety guards in `server/src/config/env.js`, `server/src/config/database.js`, and `server/src/database/migrator.js` unconditionally throw `FATAL_TEST_SAFETY_VIOLATION` if tests ever attempt to connect to `pharmatrace_ai`.

### 3.2 Least-Privilege Grants

Executed via MariaDB administrative root connection:

```sql
-- Migration execution user (DDL + DML)
CREATE USER IF NOT EXISTS 'pharmatrace_migrator'@'127.0.0.1' IDENTIFIED BY 'MigrationPass123!#';
GRANT ALL PRIVILEGES ON `pharmatrace_ai`.* TO 'pharmatrace_migrator'@'127.0.0.1';
GRANT ALL PRIVILEGES ON `pharmatrace_ai_test`.* TO 'pharmatrace_migrator'@'127.0.0.1';

-- Runtime application user (Least-privilege DML strictly prohibiting DELETE)
CREATE USER IF NOT EXISTS 'pharmatrace_app'@'127.0.0.1' IDENTIFIED BY 'AppSecurePass123!#';
GRANT SELECT, INSERT, UPDATE ON `pharmatrace_ai`.* TO 'pharmatrace_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE ON `pharmatrace_ai_test`.* TO 'pharmatrace_app'@'127.0.0.1';

FLUSH PRIVILEGES;
```

---

## 4. Environment Variables Configuration

Create the runtime configuration files in `server/`:

### 4.1 Server Runtime Configuration (`server/.env`)
```ini
PORT=5000
NODE_ENV=development

# Least-privilege runtime pool connection
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=pharmatrace_app
DB_PASSWORD=AppSecurePass123!#
DB_NAME=pharmatrace_ai

# Migration administrative connection
MIGRATION_DB_USER=pharmatrace_migrator
MIGRATION_DB_PASSWORD=MigrationPass123!#
MIGRATION_DB_NAME=pharmatrace_ai

# Security & Session Authentication
JWT_SECRET=super_secret_pharmatrace_jwt_signing_key_at_least_32_chars_long
JWT_EXPIRES_IN=15m
AUTH_COOKIE_NAME=pt_access_token
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Development Convenience (Disabled in production)
DEV_AUTH_LOCKOUT_BYPASS=true
```

### 4.2 Server Test Configuration (`server/.env.test`)
```ini
PORT=5001
NODE_ENV=test

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=pharmatrace_app
DB_PASSWORD=AppSecurePass123!#
DB_NAME=pharmatrace_ai_test

MIGRATION_DB_USER=pharmatrace_migrator
MIGRATION_DB_PASSWORD=MigrationPass123!#
MIGRATION_DB_NAME=pharmatrace_ai_test

JWT_SECRET=test_secret_pharmatrace_jwt_signing_key_at_least_32_chars_long
JWT_EXPIRES_IN=15m
AUTH_COOKIE_NAME=pt_access_token
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
DEV_AUTH_LOCKOUT_BYPASS=false
```

---

## 5. Database Initialization & Forward Migrations

All 28 migrations are applied sequentially using the deterministic migrator:

```powershell
# 1. Apply all 28 forward migrations to runtime database
cd D:\pharmatrace-ai\server
node src/database/migrate.js

# 2. Apply all 28 forward migrations to isolated test database
node --env-file=.env.test src/database/migrate.js

# 3. Verify migration status
node --env-file=.env.test src/database/migrate.js --status
```

### Forward Migration Manifest (001–028)
1. `001_create_schema_migrations.sql`: Migration ledger tracking.
2. `002_create_category_policies.sql`: Statutory DGDA category capacity limits.
3. `003_create_organizations.sql`: Organization entities and verification state.
4. `004_create_users.sql`: User accounts with bcrypt password hashes and roles.
5. `005_add_org_verification_fk.sql`: Foreign keys for organization verification.
6. `006_create_organization_registrations.sql`: Public applicant registration intake.
7. `007_create_registration_documents.sql`: Regulatory dossier document attachments.
8. `008_create_registration_access_tokens.sql`: Secure tracking access tokens.
9. `009_create_activation_tokens.sql`: 72-hour one-time activation tokens.
10. `010_create_registration_submissions.sql`: Multi-version applicant dossiers.
11. `011_create_registration_audit_log.sql`: Registration review lifecycle audit log.
12. `012_create_products.sql`: Registered medicinal products catalogue.
13. `013_create_batches.sql`: Production batches with QA release lifecycle.
14. `014_create_government_allocations.sql`: DGHS public institutional quotas.
15. `015_create_government_allocation_documents.sql`: Allocation verification attachments.
16. `016_create_packages.sql`: Serialized medicine units with verification counter.
17. `017_create_shipments_and_packages.sql`: Multi-echelon logistics shipments.
18. `018_create_traceability_events.sql`: Append-only statutory chain of custody.
19. `019_create_investigation_alerts.sql`: Regulatory anomaly detection alerts.
20. `020_create_public_reports_and_attachments.sql`: Citizen report intake.
21. `021_seed_category_policies.sql`: Default category quotas (Distributor: 1, Wholesaler: 1).
22. `022_add_user_security_columns.sql`: Account lockout and security tracking.
23. `023_create_admin_audit_log.sql`: Administrative action tracking.
24. `024_enforce_admin_audit_log_immutability.sql`: Engine triggers blocking UPDATE/DELETE.
25. `025_create_user_security_audit_log.sql`: Authentication audit trail with trigger immutability.
26. `026_add_gtin_to_products.sql`: GS1-compliant 14-digit GTIN support.
27. `027_create_investigation_cases_and_evidence.sql`: Enforcement cases and evidence records.
28. `028_protect_investigation_cases_and_evidence.sql`: Foreign key RESTRICT & deletion prevention triggers.

---

## 6. Starting Development Servers

To run the full stack locally:

### Step 1: Start MariaDB Daemon
```powershell
cd D:\Server
mysql\bin\mysqld --defaults-file=mysql\bin\my.ini --standalone
```

### Step 2: Start Express API Backend (Port 5000)
```powershell
cd D:\pharmatrace-ai\server
npm run dev
# Or with explicit environment configuration:
cmd /c "set NODE_ENV=development&&set DEV_AUTH_LOCKOUT_BYPASS=true&&node src/server.js"
```

### Step 3: Start Vite Client Frontend (Port 5173)
```powershell
cd D:\pharmatrace-ai\client
npm run dev
```

---

## 7. Running Automated Test Suites

Both backend and frontend test suites execute strictly against the isolated test database `pharmatrace_ai_test`:

### Run Server Test Suites (316 tests across 75 suites)
```powershell
cd D:\pharmatrace-ai\server
npm test
```

### Run Client Test Suites (124 tests across 14 suites)
```powershell
cd D:\pharmatrace-ai\client
npm test
```

### Run Client Production Build
```powershell
cd D:\pharmatrace-ai\client
npm run build
```

---

## 8. Clean Installation Verification Checklist

- [x] MariaDB 10.11.16 running on `127.0.0.1:3306`.
- [x] Both databases exist: `pharmatrace_ai` and `pharmatrace_ai_test`.
- [x] 28 migrations applied on both databases without errors.
- [x] All 6 canonical development accounts present in `pharmatrace_ai` with password `ValidPass123!#`.
- [x] Backend API responds at `http://localhost:5000/api/health`.
- [x] Frontend UI serves at `http://localhost:5173/login`.
- [x] Full automated regression pass: 440 passed, 0 failed across 89 combined suites.
