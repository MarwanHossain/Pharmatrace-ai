-- Migration 021: Seed Category Policies (Mandatory 4 Operational Categories)
INSERT INTO category_policies (category, display_name, max_active_instances, is_registration_allowed) VALUES
    ('manufacturer', 'Pharmaceutical Manufacturer', NULL, TRUE),
    ('distributor',  'Central Distributor',         1,    TRUE),
    ('wholesaler',   'Authorized Wholesaler',       1,    TRUE),
    ('pharmacy',     'Retail & Government Pharmacy', NULL, TRUE)
ON DUPLICATE KEY UPDATE
    display_name = VALUES(display_name),
    max_active_instances = VALUES(max_active_instances),
    is_registration_allowed = VALUES(is_registration_allowed);
