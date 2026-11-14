-- Migration 018: Traceability Events Table
CREATE TABLE IF NOT EXISTS traceability_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    serial VARCHAR(128) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    actor_user_id VARCHAR(64) NULL,
    actor_org_id VARCHAR(64) NOT NULL,
    target_org_id VARCHAR(64) NULL,
    shipment_ref VARCHAR(64) NULL,
    event_payload LONGTEXT NULL CHECK (event_payload IS NULL OR JSON_VALID(event_payload)),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_evt_pkg FOREIGN KEY (serial) REFERENCES packages(serial) ON DELETE RESTRICT,
    CONSTRAINT fk_evt_org FOREIGN KEY (actor_org_id) REFERENCES organizations(id) ON DELETE RESTRICT,
    INDEX idx_evt_serial_time (serial, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
