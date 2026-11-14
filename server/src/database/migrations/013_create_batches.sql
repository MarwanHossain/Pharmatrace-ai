-- Migration 013: Batches Table
CREATE TABLE IF NOT EXISTS batches (
    id VARCHAR(64) PRIMARY KEY,
    batch_no VARCHAR(64) NOT NULL,
    product_id VARCHAR(64) NOT NULL,
    manufacturer_id VARCHAR(64) NOT NULL,
    mfd DATE NOT NULL,
    exp DATE NOT NULL,
    quantity INT NOT NULL,
    release_status ENUM('Pending QA', 'Released', 'Quarantined', 'Rejected') NOT NULL DEFAULT 'Pending QA',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_batch_mfg (batch_no, manufacturer_id),
    CONSTRAINT fk_batch_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_batch_mfg FOREIGN KEY (manufacturer_id) REFERENCES organizations(id) ON DELETE RESTRICT,
    INDEX idx_batch_exp (exp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
