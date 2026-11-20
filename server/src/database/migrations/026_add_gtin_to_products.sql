-- Migration 026: Add GTIN To Products
-- Target: MariaDB 10.11.16
-- Adds optional unique Global Trade Item Number (GTIN-8, GTIN-12, GTIN-13, GTIN-14) to products

ALTER TABLE products
    ADD COLUMN gtin VARCHAR(14) NULL UNIQUE AFTER pack_size;
