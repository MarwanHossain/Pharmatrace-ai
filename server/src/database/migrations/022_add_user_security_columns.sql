-- Migration 022: Add User Security Columns
-- Target: MariaDB 10.11.16
-- Adds session revocation token_version, failed login tracking, and lockout window to users table

ALTER TABLE users
    ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER role,
    ADD COLUMN failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER last_login_at,
    ADD COLUMN locked_until DATETIME NULL AFTER failed_login_attempts;

CREATE INDEX idx_user_lockout ON users (status, locked_until);
