-- Migration: Remove stock column from products table
-- Date: 2026-05-04
-- Description: Remove the stock field from products table as we now use the inventory table

-- Remove the stock column from products table
ALTER TABLE products DROP COLUMN IF EXISTS stock;

-- Add comment to document the change
COMMENT ON TABLE products IS 'Product catalog - stock information is managed in the inventory table';
COMMENT ON TABLE inventory IS 'Inventory management - tracks totalStock, reservedStock, and soldStock for each product';
