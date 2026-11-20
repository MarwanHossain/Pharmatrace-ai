-- Migration 028: Protect Parent Investigation Cases & Stable Evidence Entity References
-- Enforces ON DELETE RESTRICT on child evidence & audit logs, prevents parent case deletion,
-- and adds source_entity_type / source_entity_id to investigation_evidence.

-- 1. Ensure foreign key constraints on child tables are strictly ON DELETE RESTRICT
ALTER TABLE investigation_evidence
    DROP FOREIGN KEY fk_ev_case;

ALTER TABLE investigation_evidence
    ADD CONSTRAINT fk_ev_case
    FOREIGN KEY (case_id) REFERENCES investigation_cases(id)
    ON DELETE RESTRICT;

ALTER TABLE investigation_case_audit_log
    DROP FOREIGN KEY fk_case_audit_case;

ALTER TABLE investigation_case_audit_log
    ADD CONSTRAINT fk_case_audit_case
    FOREIGN KEY (case_id) REFERENCES investigation_cases(id)
    ON DELETE RESTRICT;

-- 2. Add database-level trigger to strictly prevent direct deletion of parent investigation cases
DROP TRIGGER IF EXISTS trg_prevent_investigation_cases_delete;
CREATE TRIGGER trg_prevent_investigation_cases_delete
BEFORE DELETE ON investigation_cases
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'investigation_cases records are permanent regulatory records and cannot be deleted at database level';
END;

-- 3. Add source_entity_type and source_entity_id to investigation_evidence for stable entity reference
ALTER TABLE investigation_evidence
    ADD COLUMN source_entity_type VARCHAR(64) NULL AFTER source_ref,
    ADD COLUMN source_entity_id VARCHAR(64) NULL AFTER source_entity_type,
    ADD INDEX idx_ev_source_entity (source_entity_type, source_entity_id);
