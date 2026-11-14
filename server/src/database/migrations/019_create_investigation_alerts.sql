-- Migration 019: Investigation Alerts Table
CREATE TABLE IF NOT EXISTS investigation_alerts (
    id VARCHAR(64) PRIMARY KEY,
    alert_type ENUM('CLONED_QR_SUSPECT', 'SHRINKAGE_SPIKE', 'SHADOW_DIVERSION_RISK', 'GOVERNMENT_DIVERSION_ATTEMPT', 'UNAUTHORIZED_DISPENSE_ATTEMPT') NOT NULL,
    severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    suspect_org_id VARCHAR(64) NULL,
    reported_store_name VARCHAR(255) NULL,
    reported_location TEXT NULL,
    package_serial VARCHAR(128) NULL,
    anomaly_score DECIMAL(4,3) NULL,
    feature_attributions LONGTEXT NULL CHECK (feature_attributions IS NULL OR JSON_VALID(feature_attributions)),
    summary VARCHAR(255) NOT NULL,
    details TEXT NULL,
    status ENUM('OPEN', 'TRIAGED', 'INVESTIGATING', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
    assigned_officer_id VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_alert_org FOREIGN KEY (suspect_org_id) REFERENCES organizations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_alert_pkg FOREIGN KEY (package_serial) REFERENCES packages(serial) ON DELETE RESTRICT,
    CONSTRAINT fk_alert_officer FOREIGN KEY (assigned_officer_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_alert_status_sev (status, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
