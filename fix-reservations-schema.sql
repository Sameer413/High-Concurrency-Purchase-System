-- Fix reservations table schema for multi-item reservations
-- Run this SQL script to make productId and quantity nullable

-- Make productId nullable (for multi-item reservations stored in Redis)
ALTER TABLE "reservations" ALTER COLUMN "productId" DROP NOT NULL;

-- Make quantity nullable (for multi-item reservations stored in Redis)
ALTER TABLE "reservations" ALTER COLUMN "quantity" DROP NOT NULL;

-- Verify the changes
SELECT 
    column_name, 
    is_nullable, 
    data_type,
    column_default
FROM information_schema.columns 
WHERE table_name = 'reservations' 
  AND column_name IN ('productId', 'quantity', 'userId', 'status', 'expiresAt')
ORDER BY ordinal_position;

-- Expected output:
-- column_name | is_nullable | data_type | column_default
-- ------------+-------------+-----------+----------------
-- productId   | YES         | uuid      | 
-- userId      | NO          | uuid      | 
-- quantity    | YES         | integer   | 
-- status      | NO          | USER-DEFINED | 'ACTIVE'::reservation_status_enum
-- expiresAt   | NO          | timestamp without time zone | 
