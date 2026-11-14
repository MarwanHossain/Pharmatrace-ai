-- Migration 005: Add Government Verified By Foreign Key to Organizations
ALTER TABLE organizations
ADD CONSTRAINT fk_org_verified_by
FOREIGN KEY (government_verified_by) REFERENCES users(id) ON DELETE RESTRICT;
