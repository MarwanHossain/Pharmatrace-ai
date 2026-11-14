-- Migration 015: Government Allocation Documents Table
CREATE TABLE IF NOT EXISTS government_allocation_documents (
    id VARCHAR(64) PRIMARY KEY,
    allocation_id VARCHAR(64) NOT NULL,
    document_type ENUM('PURCHASE_ORDER', 'TENDER_AWARD', 'GOVERNMENT_MEMO', 'CONTRACT_AGREEMENT', 'INSPECTION_REPORT', 'OTHER') NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    stored_path VARCHAR(512) NOT NULL,
    file_size_bytes INT NOT NULL,
    mime_type VARCHAR(64) NOT NULL,
    uploaded_by VARCHAR(64) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gad_alloc FOREIGN KEY (allocation_id) REFERENCES government_allocations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_gad_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_gad_alloc (allocation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
