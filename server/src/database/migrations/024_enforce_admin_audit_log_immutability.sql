-- Migration 024: Enforce Unconditional Admin Audit Log Immutability
-- Replaces triggers with unconditional SQLSTATE 45000 rejections.
-- Completely removes all session-variable exceptions (@admin_audit_log_allow_update, @admin_audit_log_allow_delete).
-- Conforms strictly to Revision 3.2 §1.2 & §4.1 specifications.

-- 1. Drop existing triggers
DROP TRIGGER IF EXISTS trg_prevent_admin_audit_log_update;
DROP TRIGGER IF EXISTS trg_prevent_admin_audit_log_delete;

-- 2. Recreate UPDATE trigger with unconditional SQLSTATE 45000 rejection
CREATE TRIGGER trg_prevent_admin_audit_log_update
BEFORE UPDATE ON admin_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'admin_audit_log records are strictly immutable and cannot be updated under any circumstances';
END;

-- 3. Recreate DELETE trigger with unconditional SQLSTATE 45000 rejection
CREATE TRIGGER trg_prevent_admin_audit_log_delete
BEFORE DELETE ON admin_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'admin_audit_log records are strictly immutable and cannot be deleted under any circumstances';
END;
