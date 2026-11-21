# PharmaTrace AI — Local Development, Environment Setup & Deployment Guide

This guide provides step-by-step instructions for provisioning, configuring, and executing the complete PharmaTrace AI full-stack platform in a local development environment.

---

## 1. System Prerequisites & Software Requirements

Before setting up the project, ensure your workstation meets the following runtime specifications:

| Requirement | Supported Version | Purpose |
| :--- | :--- | :--- |
| **Operating System** | Windows 10/11, Ubuntu 22.04+ LTS, macOS Sonoma+ | Host development environment. |
| **Node.js** | **v24.18.0 LTS** (verified baseline; Node 26 supported as alternative after compatibility testing; Node 20 is EOL and not recommended; [Node.js Release Schedule](https://nodejs.org/en/about/previous-releases)) | Express backend server and Vite client build engine. |
| **npm** | **v10.x+** | Package dependency management. |
| **MariaDB Server** | **v10.11.x LTS** (MariaDB 10.11.16 verified) | Relational database engine, triggers, and pooling. |
| **Git** | **v2.40+** | Source code version control. |
| **Python** *(Optional)*| **v3.11+** | Dedicated for the separate `ai-service/` module. |

---

## 2. Repository Structure & Branch Organization

Clone the repository and inspect the active branch structure:

```bash
git clone https://github.com/MarwanHossain/Pharmatrace-ai.git
cd Pharmatrace-ai
```

### Key Branches
- **`ai-module`** *(Active Working Branch)*: Contains AI microservice scaffolding (`ai-service/`), documentation directory (`docs/`), and visual screenshot assets. Originates from commit `d7847e3`.
- **`phase-2-authentication`** *(Parent Full-Stack Branch)*: Houses the complete, passing Milestone 9 full-stack implementation (HEAD commit `d7847e383e779d82debcc49e12e58aaf6abc4487`).

---

## 3. Environment Configuration Files

PharmaTrace AI separates environment configurations between server runtime, automated test execution, and frontend client bundling.

### 3.1 Backend Development Environment (`server/.env`)
Create `server/.env` modeled after `server/.env.example`:
```ini
# Server Network Settings
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# MariaDB Primary Connection Settings (Runtime Least-Privilege User)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=pharmatrace_ai
DB_USER=pharmatrace_app
DB_PASSWORD=<your_app_password>
DB_CONNECTION_LIMIT=20

# Administrative / Migrator User (Schema DDL & Migrations)
MIGRATION_DB_USER=pharmatrace_migrator
MIGRATION_DB_PASSWORD=<your_migrator_password>
MIGRATION_DB_NAME=pharmatrace_ai

# Cryptographic Secrets
JWT_SECRET=<secure_jwt_signing_key_at_least_32_characters>
JWT_EXPIRES_IN=8h
AUTH_COOKIE_NAME=pt_access_token
```

### 3.2 Backend Test Isolation Environment (`server/.env.test`)
Create or verify `server/.env.test` for running the automated test suite:
```ini
PORT=5001
NODE_ENV=test
CLIENT_URL=http://localhost:5173

# Dedicated Automated Test Database (Targeted ONLY in test mode)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=pharmatrace_ai_test
DB_USER=pharmatrace_migrator
DB_PASSWORD=<your_migrator_password>
DB_CONNECTION_LIMIT=10

MIGRATION_DB_USER=pharmatrace_migrator
MIGRATION_DB_PASSWORD=<your_migrator_password>
MIGRATION_DB_NAME=pharmatrace_ai_test

JWT_SECRET=<test_jwt_secret_isolated_harness_at_least_32_chars>
JWT_EXPIRES_IN=15m
AUTH_COOKIE_NAME=pt_access_token
```

### 3.3 Frontend Client Environment (`client/.env`)
Create or verify `client/.env`:
```ini
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

---

## 4. MariaDB Provisioning & Schema Initialization

### 4.1 Launch MariaDB
On Windows (using standalone server directory, e.g., `D:\Server`):
```powershell
# Start MariaDB Daemon
D:\Server\bin\mysqld.exe --defaults-file=D:\Server\data\my.ini --console
```
On Linux / macOS:
```bash
sudo systemctl start mariadb
```

### 4.2 Create Databases & User Accounts
Connect to MariaDB as `root` and execute the security provisioning script:
```sql
-- 1. Create Development and Test Databases
CREATE DATABASE IF NOT EXISTS pharmatrace_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS pharmatrace_ai_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Create Schema Maintenance / Migrator Account
CREATE USER IF NOT EXISTS 'pharmatrace_migrator'@'127.0.0.1' IDENTIFIED BY '<your_migrator_password>';
GRANT ALL PRIVILEGES ON pharmatrace_ai.* TO 'pharmatrace_migrator'@'127.0.0.1';
GRANT ALL PRIVILEGES ON pharmatrace_ai_test.* TO 'pharmatrace_migrator'@'127.0.0.1';

-- 3. Create Runtime Least-Privilege Application Account (ZERO DELETE)
CREATE USER IF NOT EXISTS 'pharmatrace_app'@'127.0.0.1' IDENTIFIED BY '<your_app_password>';
GRANT SELECT ON pharmatrace_ai.* TO 'pharmatrace_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON pharmatrace_ai.* TO 'pharmatrace_app'@'127.0.0.1';
-- Explicitly revoke DELETE privileges
REVOKE DELETE ON pharmatrace_ai.* FROM 'pharmatrace_app'@'127.0.0.1';

FLUSH PRIVILEGES;
```

### 4.3 Execute Forward Migrations
Navigate to the `server/` directory and execute the migration runner:
```bash
cd server
npm install

# 1. Apply all 28 forward migrations to development database
npm run migrate

# 2. Apply all 28 forward migrations to isolated test database
npm run test:migrate

# 3. Verify migration status
npm run migrate:status
```
This executes all 28 forward migrations (`001_...` to `028_...`), builds the 26 normalized tables, and installs the 9 immutability triggers.

---

## 5. Starting the Application Services

### 5.1 Launch Backend API Server
```bash
cd server
npm run dev
```
- **Console Output:** `[PharmaTrace AI] API Server running on port 5000`
- **Health Verification:** Open `http://localhost:5000/api/v1/health` in your browser. Verify `"status": "healthy"`.

### 5.2 Launch Frontend Web Client
In a separate terminal:
```bash
cd client
npm install
npm run dev
```
- **Console Output:** `VITE v5.3.1 ready in 250 ms. Local: http://localhost:5173/`
- **Application Access:** Open `http://localhost:5173` in your browser.

---

## 6. Seed Demonstration Accounts Reference

The platform pre-provisions six canonical stakeholder accounts for demonstration. For security best practices in public documentation, seed credentials and demonstration account passwords are intentionally omitted from tracked repository documentation:

| Stakeholder Role | Role Key | Portal URL | Seed Email | Credential Provisioning |
| :--- | :---: | :--- | :--- | :--- |
| **DGDA Administrator** | `admin` | `/admin/dashboard` | `admin_m6@pharmatrace.test` | Configured via local test seeds / private internal guide |
| **Enforcement Officer** | `investigator` | `/investigator/dashboard` | `indep_officer_mwnog5r9@pharmatrace.test` | Configured via local test seeds / private internal guide |
| **Manufacturer** | `manufacturer` | `/manufacturer/dashboard` | `mfg_user_m6@pharmatrace.test` | Configured via local test seeds / private internal guide |
| **Central Distributor**| `distributor` | `/distributor/dashboard` | `dist_user_dev@pharmatrace.test` | Configured via local test seeds / private internal guide |
| **Wholesale Depot** | `wholesaler` | `/wholesaler/dashboard` | `whol_user_dev@pharmatrace.test` | Configured via local test seeds / private internal guide |
| **Licensed Pharmacy** | `pharmacy` | `/pharmacy/dashboard` | `pharm_user_dev@pharmatrace.test` | Configured via local test seeds / private internal guide |

*Public consumer verification at `/verify` requires no login.*

---

## 7. Troubleshooting & Common Pitfalls

### Issue 1: MariaDB Port 3306 Conflict
- **Cause:** Another MySQL or MariaDB instance (e.g., XAMPP, WampServer) is already occupying port 3306.
- **Solution:** Terminate conflicting processes or update `DB_PORT` in `server/.env` and `my.ini`.

### Issue 2: CORS Header Rejection (`403 Forbidden` / `Network Error`)
- **Cause:** Accessing frontend from an origin other than `http://localhost:5173` (e.g., `127.0.0.1:5173`).
- **Solution:** Always access the client via `http://localhost:5173` to match the exact string configured in `server/.env`.

### Issue 3: Session Revocation / Token Mismatch (`401 Unauthorized`)
- **Cause:** Database `token_version` was incremented during password testing or migration reset.
- **Solution:** Log out completely, clear browser cookies for `localhost`, and log in fresh at `/login`.

---

## 8. Related Documentation
- [Testing & Quality Assurance Guide](../testing/testing-and-quality-assurance.md): Running the M9 full-stack baseline test suite (440 automated tests, AI service excluded).
- [API Overview Guide](../api/api-overview.md): REST endpoints documentation.
- [System Architecture Guide](../architecture/system-architecture.md): Architectural topology and data flow models.
