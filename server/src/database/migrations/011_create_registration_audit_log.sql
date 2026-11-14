-- Migration 011: Registration Audit Log Table
CREATE TABLE IF NOT EXISTS registration_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    registration_id VARCHAR(64) NOT NULL,
    actor_user_id VARCHAR(64) NULL,
    actor_role VARCHAR(32) NOT NULL,
    from_status VARCHAR(32) NULL,
    to_status VARCHAR(32) NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    comment TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_reg FOREIGN KEY (registration_id) REFERENCES organization_registrations(id) ON DELETE RESTRICT,
    INDEX idx_audit_reg_time (registration_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
