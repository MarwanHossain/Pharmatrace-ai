-- Migration 027: Investigation Cases, Evidence, and Immutable Audit Log
-- Extends PharmaTrace AI regulatory enforcement capabilities for Milestone M8

-- 1. Expand alert_type ENUM in investigation_alerts table to support all statutory detection rules
ALTER TABLE investigation_alerts MODIFY COLUMN alert_type ENUM(
    'CLONED_QR_SUSPECT',
    'SHRINKAGE_SPIKE',
    'SHADOW_DIVERSION_RISK',
    'GOVERNMENT_DIVERSION_ATTEMPT',
    'UNAUTHORIZED_DISPENSE_ATTEMPT',
    'DUPLICATE_SCAN_ANOMALY',
    'UNUSUAL_VERIFICATION_PATTERN',
    'SHIPMENT_QUANTITY_DISCREPANCY',
    'GOVERNMENT_DIVERSION_INDICATOR',
    'BROKEN_CUSTODY_HISTORY',
    'UNAUTHORIZED_CUSTODY_ACTIVITY'
) NOT NULL;

-- 2. Create investigation_cases table
CREATE TABLE IF NOT EXISTS investigation_cases (
    id VARCHAR(64) PRIMARY KEY,
    case_number VARCHAR(32) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    status ENUM('open', 'under_review', 'resolved', 'closed') NOT NULL DEFAULT 'open',
    priority ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
    alert_id VARCHAR(64) NULL,
    package_serial VARCHAR(128) NULL,
    batch_id VARCHAR(64) NULL,
    suspect_org_id VARCHAR(64) NULL,
    assigned_officer_id VARCHAR(64) NULL,
    findings TEXT NULL,
    resolution TEXT NULL,
    closed_at TIMESTAMP NULL,
    closed_by_user_id VARCHAR(64) NULL,
    created_by_user_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_alert FOREIGN KEY (alert_id) REFERENCES investigation_alerts(id) ON DELETE SET NULL,
    CONSTRAINT fk_case_pkg FOREIGN KEY (package_serial) REFERENCES packages(serial) ON DELETE RESTRICT,
    CONSTRAINT fk_case_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE RESTRICT,
    CONSTRAINT fk_case_org FOREIGN KEY (suspect_org_id) REFERENCES organizations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_case_officer FOREIGN KEY (assigned_officer_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_case_closer FOREIGN KEY (closed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_case_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_case_status_prio (status, priority),
    INDEX idx_case_number (case_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create investigation_evidence table
CREATE TABLE IF NOT EXISTS investigation_evidence (
    id VARCHAR(64) PRIMARY KEY,
    case_id VARCHAR(64) NOT NULL,
    evidence_type ENUM('verified_fact', 'reported_allegation', 'investigator_conclusion', 'system_event', 'custody_record', 'document') NOT NULL,
    description TEXT NOT NULL,
    source_ref VARCHAR(255) NULL,
    recorded_by_user_id VARCHAR(64) NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ev_case FOREIGN KEY (case_id) REFERENCES investigation_cases(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ev_user FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_ev_case (case_id, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Triggers to enforce unconditional immutability on investigation_evidence
DROP TRIGGER IF EXISTS trg_prevent_investigation_evidence_update;
CREATE TRIGGER trg_prevent_investigation_evidence_update
BEFORE UPDATE ON investigation_evidence
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'investigation_evidence records are strictly immutable and cannot be updated';
END;

DROP TRIGGER IF EXISTS trg_prevent_investigation_evidence_delete;
CREATE TRIGGER trg_prevent_investigation_evidence_delete
BEFORE DELETE ON investigation_evidence
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'investigation_evidence records are strictly immutable and cannot be deleted';
END;

-- 5. Create investigation_case_audit_log table
CREATE TABLE IF NOT EXISTS investigation_case_audit_log (
    id VARCHAR(64) PRIMARY KEY,
    case_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    actor_user_id VARCHAR(64) NOT NULL,
    previous_state JSON NULL,
    new_state JSON NULL,
    notes TEXT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_case_audit_case FOREIGN KEY (case_id) REFERENCES investigation_cases(id) ON DELETE RESTRICT,
    CONSTRAINT fk_case_audit_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_case_audit (case_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Triggers to enforce unconditional immutability on investigation_case_audit_log
DROP TRIGGER IF EXISTS trg_prevent_investigation_case_audit_update;
CREATE TRIGGER trg_prevent_investigation_case_audit_update
BEFORE UPDATE ON investigation_case_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'investigation_case_audit_log records are strictly immutable and cannot be updated';
END;

DROP TRIGGER IF EXISTS trg_prevent_investigation_case_audit_delete;
CREATE TRIGGER trg_prevent_investigation_case_audit_delete
BEFORE DELETE ON investigation_case_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'investigation_case_audit_log records are strictly immutable and cannot be deleted';
END;
