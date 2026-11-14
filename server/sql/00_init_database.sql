-- ============================================================================
-- PharmaTrace AI — Database & Dual-Account Security Setup
-- Target Database: XAMPP MariaDB 10.11.16 / MySQL 8.0+
-- File: server/sql/00_init_database.sql
-- ============================================================================
-- INSTRUCTIONS FOR SYSTEM ADMINISTRATOR:
-- 1. Ensure XAMPP MariaDB is running (via XAMPP Control Panel or mysql_start.bat).
-- 2. Open a command prompt as administrator or use the MariaDB CLI:
--      D:\Server\mysql\bin\mysql.exe -u root -p
-- 3. Replace the placeholder passwords below with strong, distinct, randomly generated passwords:
--      - 'REPLACE_WITH_MIGRATOR_SECURE_PASSWORD' for the migration runner
--      - 'REPLACE_WITH_APP_RUNTIME_SECURE_PASSWORD' for the Express runtime
-- 4. Execute the SQL statements below to create the database and both accounts.
-- 5. Copy the chosen passwords into your server/.env file:
--      MIGRATION_DB_USER=pharmatrace_migrator
--      MIGRATION_DB_PASSWORD=<chosen_migrator_password>
--      DB_USER=pharmatrace_app
--      DB_PASSWORD=<chosen_app_password>
--
-- PRIVILEGE SEPARATION ARCHITECTURE:
-- • Migration Account (`pharmatrace_migrator`):
--   Used strictly by deployment/migration CLI tools. Receives DDL + DML
--   permissions required to manage tables, foreign keys, indexes, and migrations.
-- • Application Runtime Account (`pharmatrace_app`):
--   Used by Express.js during normal request handling. Receives strictly
--   DML permissions (SELECT, INSERT, UPDATE, DELETE, EXECUTE).
--   EXPLICITLY DENIED: CREATE, ALTER, DROP, INDEX, REFERENCES, GRANT OPTION.
-- ============================================================================

-- Step 1: Create the authoritative application database with utf8mb4 encoding
CREATE DATABASE IF NOT EXISTS `pharmatrace_ai`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Step 2: Create the dedicated Migration User (DDL + DML)
CREATE USER IF NOT EXISTS 'pharmatrace_migrator'@'127.0.0.1'
  IDENTIFIED BY 'REPLACE_WITH_MIGRATOR_SECURE_PASSWORD';

CREATE USER IF NOT EXISTS 'pharmatrace_migrator'@'localhost'
  IDENTIFIED BY 'REPLACE_WITH_MIGRATOR_SECURE_PASSWORD';

-- Grant DDL and DML privileges strictly on the application database to the migrator
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, LOCK TABLES, EXECUTE
  ON `pharmatrace_ai`.*
  TO 'pharmatrace_migrator'@'127.0.0.1';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, LOCK TABLES, EXECUTE
  ON `pharmatrace_ai`.*
  TO 'pharmatrace_migrator'@'localhost';

-- Step 3: Create the dedicated Application Runtime User (DML ONLY - Least Privilege)
CREATE USER IF NOT EXISTS 'pharmatrace_app'@'127.0.0.1'
  IDENTIFIED BY 'REPLACE_WITH_APP_RUNTIME_SECURE_PASSWORD';

CREATE USER IF NOT EXISTS 'pharmatrace_app'@'localhost'
  IDENTIFIED BY 'REPLACE_WITH_APP_RUNTIME_SECURE_PASSWORD';

-- Grant ONLY operational DML privileges on the application database to runtime app
-- NO DDL permissions (CREATE, ALTER, DROP, INDEX, REFERENCES are NOT granted)
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE
  ON `pharmatrace_ai`.*
  TO 'pharmatrace_app'@'127.0.0.1';

GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE
  ON `pharmatrace_ai`.*
  TO 'pharmatrace_app'@'localhost';

-- Step 4: Apply privilege changes
FLUSH PRIVILEGES;

-- ============================================================================
-- Verification Queries:
--   SHOW DATABASES LIKE 'pharmatrace_ai';
--   SHOW GRANTS FOR 'pharmatrace_migrator'@'127.0.0.1';
--   SHOW GRANTS FOR 'pharmatrace_app'@'127.0.0.1';
-- ============================================================================
