-- Migration 023: Admin Audit Log Table and Immutability Triggers
-- Conforms to Revision 3.2 §1.2 & §4.1 specifications

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    admin_user_id VARCHAR(64) NOT NULL,
    target_user_id VARCHAR(64) NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    previous_status VARCHAR(32) NULL,
    new_status VARCHAR(32) NOT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_admin_audit_actor FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_admin_audit_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_admin_audit_target (target_user_id, created_at),
    INDEX idx_admin_audit_actor (admin_user_id, created_at),
    CHECK (metadata IS NULL OR JSON_VALID(metadata))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enforce append-only immutable retention: reject UPDATE operations
CREATE TRIGGER IF NOT EXISTS trg_prevent_admin_audit_log_update
BEFORE UPDATE ON admin_audit_log
FOR EACH ROW
BEGIN
    IF @admin_audit_log_allow_update IS NULL OR @admin_audit_log_allow_update != 1 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'admin_audit_log records are immutable and cannot be updated';
    END IF;
END;

-- Enforce append-only immutable retention: reject DELETE operations
CREATE TRIGGER IF NOT EXISTS trg_prevent_admin_audit_log_delete
BEFORE DELETE ON admin_audit_log
FOR EACH ROW
BEGIN
    IF @admin_audit_log_allow_delete IS NULL OR @admin_audit_log_allow_delete != 1 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'admin_audit_log records are immutable and cannot be deleted';
    END IF;
END;
