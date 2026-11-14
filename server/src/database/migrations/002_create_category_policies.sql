-- Migration 002: Category Policies Table
CREATE TABLE IF NOT EXISTS category_policies (
    category VARCHAR(32) PRIMARY KEY,
    display_name VARCHAR(64) NOT NULL,
    max_active_instances INT NULL,
    is_registration_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
