-- Migration 008: Registration Access Tokens Table
CREATE TABLE IF NOT EXISTS registration_access_tokens (
    id VARCHAR(64) PRIMARY KEY,
    registration_id VARCHAR(64) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rat_reg FOREIGN KEY (registration_id) REFERENCES organization_registrations(id) ON DELETE RESTRICT,
    INDEX idx_rat_lookup (token_hash, used, revoked, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
