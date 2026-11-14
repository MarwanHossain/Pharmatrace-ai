-- Migration 010: Registration Submissions Table (JSON Validation Constraint)
CREATE TABLE IF NOT EXISTS registration_submissions (
    id VARCHAR(64) PRIMARY KEY,
    registration_id VARCHAR(64) NOT NULL,
    version INT NOT NULL,
    submitted_data LONGTEXT NOT NULL CHECK (JSON_VALID(submitted_data)),
    applicant_note TEXT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sub_reg FOREIGN KEY (registration_id) REFERENCES organization_registrations(id) ON DELETE RESTRICT,
    UNIQUE KEY uq_sub_version (registration_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
