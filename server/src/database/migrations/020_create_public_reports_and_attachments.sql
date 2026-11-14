-- Migration 020: Public Reports and Report Attachments Tables
CREATE TABLE IF NOT EXISTS public_reports (
    id VARCHAR(64) PRIMARY KEY,
    report_number VARCHAR(32) NOT NULL,
    report_type ENUM('GOVERNMENT_MEDICINE_DIVERSION', 'COUNTERFEIT_SUSPECTED', 'EXPIRED_PRODUCT', 'PACKAGING_DEFECT', 'OTHER') NOT NULL,
    package_serial VARCHAR(128) NULL,
    reported_store_name VARCHAR(255) NOT NULL,
    reported_store_address TEXT NOT NULL,
    city_district VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    contact_phone VARCHAR(32) NULL,
    status ENUM('PENDING', 'INVESTIGATING', 'ACTION_TAKEN', 'CLOSED') NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_rep_num (report_number),
    CONSTRAINT fk_rep_pkg FOREIGN KEY (package_serial) REFERENCES packages(serial) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS public_report_attachments (
    id VARCHAR(64) PRIMARY KEY,
    report_id VARCHAR(64) NOT NULL,
    attachment_type ENUM('PACKAGE_PHOTO', 'PURCHASE_RECEIPT', 'STOREFRONT_PHOTO', 'BLISTER_PACK_IMAGE', 'OTHER') NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    stored_path VARCHAR(512) NOT NULL,
    file_size_bytes INT NOT NULL,
    mime_type VARCHAR(64) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pra_rep FOREIGN KEY (report_id) REFERENCES public_reports(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
