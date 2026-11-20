-- Migration 025: Shared User Security Audit Log & Immutability Triggers
-- Conforms to Revision 3.2 §1.2, §4.1 & Cross-Role Security Audit Standards

CREATE TABLE IF NOT EXISTS user_security_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    reason TEXT NULL,
    metadata JSON NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_sec_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_user_sec_audit_user_time (user_id, created_at),
    INDEX idx_user_sec_audit_event_time (event_type, created_at),
    CHECK (metadata IS NULL OR JSON_VALID(metadata))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enforce unconditional append-only immutability: reject UPDATE operations
CREATE TRIGGER IF NOT EXISTS trg_prevent_user_security_audit_log_update
BEFORE UPDATE ON user_security_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'user_security_audit_log records are strictly immutable and cannot be updated under any circumstances';
END;

-- Enforce unconditional append-only immutability: reject DELETE operations
CREATE TRIGGER IF NOT EXISTS trg_prevent_user_security_audit_log_delete
BEFORE DELETE ON user_security_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'user_security_audit_log records are strictly immutable and cannot be deleted under any circumstances';
END;
