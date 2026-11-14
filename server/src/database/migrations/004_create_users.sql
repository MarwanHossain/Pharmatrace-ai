-- Migration 004: Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    org_id VARCHAR(64) NULL,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(128) NOT NULL,
    password_hash VARCHAR(255) NULL,
    role ENUM('admin', 'investigator', 'manufacturer', 'distributor', 'wholesaler', 'pharmacy') NOT NULL,
    status ENUM('pending_activation', 'active', 'inactive', 'locked') NOT NULL DEFAULT 'pending_activation',
    last_login_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_email (email),
    CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE RESTRICT,
    INDEX idx_user_auth (email, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
