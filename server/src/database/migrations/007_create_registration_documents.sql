-- Migration 007: Registration Documents Table
CREATE TABLE IF NOT EXISTS registration_documents (
    id VARCHAR(64) PRIMARY KEY,
    registration_id VARCHAR(64) NOT NULL,
    submission_version INT NOT NULL DEFAULT 1,
    document_type ENUM('DRUG_LICENSE', 'TRADE_LICENSE', 'MANUFACTURING_LICENSE', 'WHOLESALE_LICENSE', 'INCORPORATION_CERTIFICATE', 'GMP_CERTIFICATE', 'DGHS_FACILITY_GAZETTE', 'OTHER') NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    stored_path VARCHAR(512) NOT NULL,
    file_size_bytes INT NOT NULL,
    mime_type VARCHAR(64) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_docs_reg FOREIGN KEY (registration_id) REFERENCES organization_registrations(id) ON DELETE RESTRICT,
    INDEX idx_doc_reg_version (registration_id, submission_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
