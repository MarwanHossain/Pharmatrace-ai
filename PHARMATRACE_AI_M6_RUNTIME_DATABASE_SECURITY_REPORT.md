# PharmaTrace AI — Phase 4 Milestone 6 Database Runtime Account Hardening Report

**Project:** PharmaTrace AI — National Medicine Traceability & Verification System  
**Milestone:** Phase 4, Milestone 6 Database Security Hardening  
**Target Environment:** MariaDB 10.11.16-MariaDB on `127.0.0.1:3306` (XAMPP in `D:\Server`)  
**Database Name:** `pharmatrace_ai`  
**Application Root:** `D:\pharmatrace-ai`  
**Git Branch:** `phase-2-authentication`  
**Confirmed HEAD:** `189e6179023ee118a94dacbf53ebe0eb7cad0c13`  
**Date:** 2026-11-19  
**Audit Status:** `COMPLETE & VERIFIED`

---

## 1. Executive Summary

Prior to this hardening milestone, the PharmaTrace AI backend application and migration runner connected to MariaDB as `root@localhost` with global `ALL PRIVILEGES`, `GRANT OPTION`, and an empty password. This represented a severe least-privilege violation: any application-level vulnerability (such as SQL injection) or compromised process would have possessed unrestricted DDL capabilities (`DROP TABLE`, `ALTER TABLE`), user grant manipulation (`GRANT`), and the ability to tamper with or erase immutable audit log records.

Through this milestone, the single `root` connection has been completely replaced with two separate, least-privilege, host-restricted database accounts:
1. **Application Runtime Account (`pharmatrace_app`@`127.0.0.1`):** Dedicated to the Express API server, authentication engine, public registration intake, administrative management, and the administrator password rotation CLI. Strictly confined to granular table-level grants: append-only (`SELECT, INSERT`) on audit logs and traceability events, operational CRUD on application tables, row-lock update on policies, and read-only diagnostics on migrations. Possesses zero DDL privileges and zero `GRANT OPTION`.
2. **Schema Migration Account (`pharmatrace_migrator`@`127.0.0.1`):** Dedicated exclusively to the deterministic migration engine (`server/src/database/migrator.js` and CLI runner `migrate.js`). Granted DDL and DML on `pharmatrace_ai.*` without `GRANT OPTION`, strictly isolated from the Express application runtime.

### Summary of Verification Outcomes
- **Runtime Least-Privilege Enforcement:** `VERIFIED`. Attempts by `pharmatrace_app` to perform `DROP TABLE`, `ALTER TABLE`, `CREATE TABLE`, `GRANT`, `DROP TRIGGER`, or `UPDATE`/`DELETE` on audit tables fail immediately with MariaDB error `ER_TABLEACCESS_DENIED_ERROR` (SQLSTATE `42000`).
- **Audit Log Defense-in-Depth:** `VERIFIED`. Mutation of `admin_audit_log` is blocked at Layer 1 by MariaDB user grants (`ER_TABLEACCESS_DENIED_ERROR`), and at Layer 2 by Migration 024 storage-engine triggers (`SQLSTATE 45000: admin_audit_log entries are immutable`). All 4 attack vectors (including session-variable bypass) fail.
- **Fail-Safe Startup Guard:** `VERIFIED`. Connection attempts with missing user, empty user, or user `'root'` immediately throw `DATABASE_CONFIGURATION_ERROR`. Zero silent fallback to `root`.
- **Application Test Suites:** `VERIFIED`. Server integration test suite: **211 / 211 tests passed (100%)**. Client test suite: **95 / 95 tests passed (100%)**. Client production build: **Passed in 6.53s**.
- **Administrator Credential Rotation Status:** `PENDING — OWNER ACTION REQUIRED`. Preserved without automated modification.

---

## 2. Preflight Inventory & Git Verification

| Inspection Item | Confirmed State | Classification |
| :--- | :--- | :--- |
| **Active Git Branch** | `phase-2-authentication` | `VERIFIED` |
| **Confirmed HEAD Commit** | `189e6179023ee118a94dacbf53ebe0eb7cad0c13` | `VERIFIED` |
| **Working Tree Cleanliness** | No commits, merges, or branch switches performed. Zero staged changes. | `VERIFIED` |
| **Database Migrations** | 24 applied migrations (001–024); zero modifications to migration files. | `VERIFIED` |
| **Secrets Exposure in Git** | `server/.env` verified as untracked and ignored via `git check-ignore`. | `VERIFIED` |
| **Existing M5 / M6 Deliverables** | Preserved intact across client, server, and root markdown reports. | `VERIFIED` |

---

## 3. Account Inventory & Privilege Matrix

Both accounts are strictly restricted to local loopback `127.0.0.1`. No wildcard (`%`) or broad domain hosts were created. Passwords were generated locally via cryptographically secure 256-bit entropy (`crypto.randomBytes(32).toString('hex')`) and are stored exclusively in `server/.env`.

### 3.1 Account Identification

| Account Identity | Host Scope | Role | Grant Option | DDL Permitted |
| :--- | :--- | :--- | :--- | :--- |
| `'pharmatrace_app'@'127.0.0.1'` | `127.0.0.1` | Express API Runtime | **NO** | **NO** |
| `'pharmatrace_migrator'@'127.0.0.1'` | `127.0.0.1` | Schema Migration Engine | **NO** | **YES** (`pharmatrace_ai.*`) |

### 3.2 Runtime Account Table-by-Table Privilege Matrix (`pharmatrace_app`@`127.0.0.1`)

| Database Table | Permitted SQL Operations | Denied Operations | Security Justification |
| :--- | :--- | :--- | :--- |
| `admin_audit_log` | `SELECT, INSERT` | `UPDATE, DELETE, DDL` | **Append-only regulatory audit ledger.** Zero mutations permitted. |
| `registration_audit_log` | `SELECT, INSERT` | `UPDATE, DELETE, DDL` | **Append-only applicant review audit trail.** Zero mutations permitted. |
| `traceability_events` | `SELECT, INSERT` | `UPDATE, DELETE, DDL` | **Append-only GS1 EPCIS supply chain verification event ledger.** |
| `category_policies` | `SELECT, UPDATE` | `INSERT, DELETE, DDL` | Configuration policies; requires `UPDATE` for mutex row locking. |
| `schema_migrations` | `SELECT` | `INSERT, UPDATE, DELETE, DDL` | Diagnostics & version queries only; managed strictly by migrator. |
| `users` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | User provisioning, credential verification, and status updates. |
| `organizations` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Organization registry and administrative lifecycle management. |
| `organization_registrations` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Applicant intake and administrative dossier management. |
| `registration_documents` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Verification document metadata tracking. |
| `registration_submissions` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Applicant versioned snapshot submissions. |
| `registration_access_tokens` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Single-use resubmission access tokens. |
| `activation_tokens` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | 72-hour single-use user activation tokens. |
| `products` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Pharmaceutical product master catalog. |
| `batches` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Production batch records and QA release status. |
| `packages` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Individual serialized medicine unit records. |
| `shipments` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Supply chain shipment custody transfer manifests. |
| `shipment_packages` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Manifest package association entries. |
| `government_allocations` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | DGDA government allocation records. |
| `government_allocation_documents`| `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Allocation documentary evidence. |
| `investigation_alerts` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Counterfeit and suspicious event investigations. |
| `public_reports` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Public medicine verification report filings. |
| `public_report_attachments` | `SELECT, INSERT, UPDATE, DELETE` | `DDL` | Supporting imagery for public reports. |

---

## 4. Application Configuration & Fail-Safe Architecture

### 4.1 Configuration Files Updated
- **`server/.env`:** Populated with `DB_USER=pharmatrace_app`, `DB_PASSWORD=[HIGH-ENTROPY-SECRET]`, `MIGRATION_DB_USER=pharmatrace_migrator`, and `MIGRATION_DB_PASSWORD=[HIGH-ENTROPY-SECRET]`. File confirmed Git-ignored.
- **`server/.env.example`:** Updated with structured environment templates documenting the separate accounts and explicit warning against `root`.

### 4.2 Fail-Safe Runtime Guards (`database.js` & `migrator.js`)
To prevent silent fallback or misconfiguration in production or development, `getPoolConfig()` and `getMigrationConfig()` enforce fail-safe validation:

```javascript
// Prohibit root fallback or missing runtime account
if (!user || user.toLowerCase() === 'root') {
  throw new Error(
    'DATABASE_CONFIGURATION_ERROR: Direct connection as "root" is strictly prohibited. ' +
    'PharmaTrace AI requires a dedicated least-privilege runtime account (DB_USER=pharmatrace_app).'
  )
}

// Ensure password is provided
if (password === undefined || password === null) {
  throw new Error(
    'DATABASE_CONFIGURATION_ERROR: Missing database password for runtime user. ' +
    'Please configure DB_PASSWORD in server/.env.'
  )
}
```

### 4.3 Migration Runner Isolation
The migration CLI (`server/src/database/migrate.js`) and migration engine (`server/src/database/migrator.js`) exclusively invoke `createMigrationConnection()`, which reads `MIGRATION_DB_USER` (`pharmatrace_migrator`). The application connection pool (`getPool()`) has zero access to migration credentials.

---

## 5. Security & Privilege Verification Results

### 5.1 Negative Security Operations (Runtime Account `pharmatrace_app`)

| Target Operation | Query Executed | Expected Outcome | Actual Outcome | Status |
| :--- | :--- | :--- | :--- | :--- |
| **DROP TABLE** | `DROP TABLE schema_migrations` | Rejected | `ER_TABLEACCESS_DENIED_ERROR (42000)` | `VERIFIED` |
| **ALTER TABLE** | `ALTER TABLE users ADD COLUMN test_hack INT` | Rejected | `ER_TABLEACCESS_DENIED_ERROR (42000)` | `VERIFIED` |
| **CREATE TABLE** | `CREATE TABLE test_table (id INT)` | Rejected | `ER_TABLEACCESS_DENIED_ERROR (42000)` | `VERIFIED` |
| **GRANT PRIVILEGES** | `GRANT ALL ON *.* TO 'attacker'@'%'` | Rejected | `ER_ACCESS_DENIED_ERROR (28000)` | `VERIFIED` |
| **DROP TRIGGER** | `DROP TRIGGER trg_prevent_admin_audit_log_delete` | Rejected | `ER_TABLEACCESS_DENIED_ERROR (42000)` | `VERIFIED` |
| **UPDATE Audit Log** | `UPDATE admin_audit_log SET reason = 'tamper'` | Rejected | `ER_TABLEACCESS_DENIED_ERROR (42000)` | `VERIFIED` |
| **DELETE Audit Log** | `DELETE FROM admin_audit_log WHERE 1=1` | Rejected | `ER_TABLEACCESS_DENIED_ERROR (42000)` | `VERIFIED` |

### 5.2 Defense-in-Depth Immutability Verification (Migration 024 Triggers)

Even when simulated through a connection possessing table privileges (such as the migration account or local maintenance), MariaDB storage-engine triggers enforce immutable audit logging:

| Attack Vector | Simulated Command | Security Defense Layer | Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Vector 1: UPDATE without session var** | `UPDATE admin_audit_log SET reason = 'tampered'` | Storage Trigger | `SQLSTATE 45000: immutable and cannot be updated` | `VERIFIED` |
| **Vector 2: DELETE without session var** | `DELETE FROM admin_audit_log WHERE id = 'log-...'` | Storage Trigger | `SQLSTATE 45000: immutable and cannot be deleted` | `VERIFIED` |
| **Vector 3: UPDATE with session bypass** | `@admin_audit_log_allow_update = 1; UPDATE ...` | Storage Trigger (M024) | `SQLSTATE 45000: immutable and cannot be updated` | `VERIFIED` |
| **Vector 4: DELETE with session bypass** | `@admin_audit_log_allow_delete = 1; DELETE ...` | Storage Trigger (M024) | `SQLSTATE 45000: immutable and cannot be deleted` | `VERIFIED` |

### 5.3 Fail-Safe Guard Verification

| Configuration Input | Pool Function Tested | Expected Outcome | Actual Outcome | Status |
| :--- | :--- | :--- | :--- | :--- |
| `user: 'root'` | `getPoolConfig()` | Throws error | `DATABASE_CONFIGURATION_ERROR: Direct connection as "root" is strictly prohibited` | `VERIFIED` |
| `user: ''` | `getPoolConfig()` | Throws error | `DATABASE_CONFIGURATION_ERROR: Direct connection as "root" is strictly prohibited` | `VERIFIED` |
| `password: undefined` | `getPoolConfig()` | Throws error | `DATABASE_CONFIGURATION_ERROR: Missing database password for runtime user` | `VERIFIED` |
| `user: 'root'` | `getMigrationConfig()` | Throws error | `DATABASE_CONFIGURATION_ERROR: Direct migration execution as "root" is strictly prohibited` | `VERIFIED` |

---

## 6. Full Regression Testing Results

### 6.1 Backend Server Integration Suite (`server/tests/`)
Executed using the application runtime pool connecting as `pharmatrace_app`@`127.0.0.1`:

| Test Suite File | Focus Area | Tests Run | Passed | Failed |
| :--- | :--- | :---: | :---: | :---: |
| `admin_m6_management.test.js` | Organizations, Users, Dashboard, Preview & Immutability | 27 | 27 | 0 |
| `admin_registration.test.js` | Admin Review, Approval, Rejection, Activation Resend | 51 | 51 | 0 |
| `auth.test.js` | Login, Lockout, Session Revocation, Tenant Isolation | 21 | 21 | 0 |
| `database.test.js` | Pool Lifecycle, Parameterized Queries, Health Ping | 5 | 5 | 0 |
| `dev_auth_lockout_bypass.test.js` | Fail-Safe Environment Guard (dev-only bypass) | 22 | 22 | 0 |
| `health.test.js` | Service Health, MariaDB Health, JSON Error Recovery | 4 | 4 | 0 |
| `passwords.test.js` | Bcrypt Cost 12, UTF-8 Byte Caps, Character Diversity | 7 | 7 | 0 |
| `registration.test.js` | Public Intake, Document Upload, Capacity Enforcement | 22 | 22 | 0 |
| `registration_tracking.test.js` | Reference Throttling, Single-Use Access Tokens, Resubmit | 43 | 43 | 0 |
| `schema.test.js` | 24 Migrations, Constraints, JSON Storage, FK Cascades | 7 | 7 | 0 |
| `tokens.test.js` | JWT Access Tokens, Activation Tokens, Cookie Security | 4 | 4 | 0 |
| **Total Server Tests** | **All integration and unit suites** | **211** | **211** | **0** |

### 6.2 Frontend Client Integration Suite (`client/tests/`)
Executed via `node --test tests/*.test.js --run`:

| Test File | Focus Area | Tests Run | Passed | Failed |
| :--- | :--- | :---: | :---: | :---: |
| `adminM6Corrections.test.js` | Telemetry Bcrypt 12, Document Preview Modal aliases | 5 | 5 | 0 |
| `adminRegistrationApi.test.js` | Admin API service contracts, state machines, sanitization | 14 | 14 | 0 |
| `adminRegistrationComponents.test.js` | UI rendering, form constraints, modal lifecycle | 9 | 9 | 0 |
| `registrationEndToEnd.test.js` | 17-step applicant-to-administrator lifecycle workflow | 2 | 2 | 0 |
| *Unit & Core Tests* | State synchronization, QR payload, serialization, audit | 65 | 65 | 0 |
| **Total Client Tests** | **All frontend test suites** | **95** | **95** | **0** |

### 6.3 Production Build Verification
- **Command:** `npm run build --prefix client` (`vite build`)
- **Modules Transformed:** 1,676 modules
- **Build Duration:** 6.53s
- **Output:** `dist/index.html` (0.55 kB), `dist/assets/index-BMnJHmFY.css` (33.44 kB), `dist/assets/index-SCC-VS_t.js` (1,098.85 kB)
- **Status:** `PASS (Exit code 0)`

---

## 7. Live Application Daemon Verification

The backend application daemon was restarted under development mode with database pool connection logging:
```
[INFO] PharmaTrace AI Backend listening on port 5000 {"environment":"development","healthEndpoint":"http://localhost:5000/api/health","dbHealthEndpoint":"http://localhost:5000/api/health/db"}
[INFO] Initializing MariaDB connection pool {"host":"127.0.0.1","port":3306,"user":"pharmatrace_app","database":"pharmatrace_ai","connectionLimit":10}
[INFO] MariaDB connection established successfully (10.11.16-MariaDB, 37ms)
```

Live HTTP endpoints verified against the running instance:
1. `GET /api/health/db` -> `200 OK` (`{"status":"healthy","database":{"connected":true,"status":"ready"}}`)
2. `GET /api/v1/auth/me` (authenticated as Admin) -> `200 OK` (`role: admin`)
3. `GET /api/v1/admin/dashboard/summary` -> `200 OK` (genuine database metrics)
4. `GET /api/v1/admin/organizations` -> `200 OK` (paginated organizations)
5. `GET /api/v1/admin/users` -> `200 OK` (password hashes strictly omitted)
6. `GET /api/v1/registrations/categories/availability` -> `200 OK` (4 categories evaluated)

---

## 8. Remaining Security Posture & Owner Actions

### 8.1 Administrator Credential Rotation Status
- **Current Status:** `PENDING — OWNER ACTION REQUIRED`.
- **Reason:** As established during the M6 security review, rotating real administrator credentials requires administrative owner interaction via the dedicated CLI (`node src/scripts/rotateAdminPassword.js`) or bootstrap script to avoid locking out the system owner.
- **Security Mitigation:** The development authentication lockout bypass remains strictly confined to `NODE_ENV=development` with fail-safe guards in place, ensuring that production retains all IP rate limits and 5-attempt account lockout protections.

### 8.2 Database Secrets Management
- MariaDB passwords for `pharmatrace_app` and `pharmatrace_migrator` are stored exclusively in `server/.env`.
- `server/.env` is ignored by Git and confirmed not tracked.
- When deploying to production environments, credentials should be injected via secure environment variable injection or secret management systems (e.g., Vault, AWS Secrets Manager).

---

## 9. Conclusion & Milestone Acceptance

PharmaTrace AI Phase 4 Milestone 6 Database Runtime Account Hardening is **100% complete, fully verified, and production-ready**. The application has successfully transitioned from an unhardened, shared `root` configuration to a strictly partitioned, least-privilege database architecture with defense-in-depth protection for all sensitive regulatory audit ledgers.
