-- Migration 017: Shipments and Shipment Packages Tables
CREATE TABLE IF NOT EXISTS shipments (
    ref VARCHAR(64) PRIMARY KEY,
    from_org_id VARCHAR(64) NOT NULL,
    to_org_id VARCHAR(64) NOT NULL,
    status ENUM('draft', 'preparing', 'pending', 'in_transit', 'partially_received', 'accepted', 'reconciliation_required', 'closed') NOT NULL DEFAULT 'draft',
    package_count INT NOT NULL DEFAULT 0,
    allocation_scope ENUM('COMMERCIAL_ONLY', 'GOVERNMENT_ONLY', 'MIXED') NOT NULL DEFAULT 'COMMERCIAL_ONLY',
    dispatched_at DATETIME NULL,
    received_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_shp_from FOREIGN KEY (from_org_id) REFERENCES organizations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_shp_to FOREIGN KEY (to_org_id) REFERENCES organizations(id) ON DELETE RESTRICT,
    INDEX idx_shp_participants (from_org_id, to_org_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipment_packages (
    shipment_ref VARCHAR(64) NOT NULL,
    package_serial VARCHAR(128) NOT NULL,
    disposition_status ENUM('outstanding', 'accepted', 'damaged', 'missing', 'rejected') NOT NULL DEFAULT 'outstanding',
    scanned_at_receiving BOOLEAN NOT NULL DEFAULT FALSE,
    disposition_reason VARCHAR(255) NULL,
    PRIMARY KEY (shipment_ref, package_serial),
    CONSTRAINT fk_sp_shp FOREIGN KEY (shipment_ref) REFERENCES shipments(ref) ON DELETE RESTRICT,
    CONSTRAINT fk_sp_pkg FOREIGN KEY (package_serial) REFERENCES packages(serial) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
