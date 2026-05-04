# Database Migration Required

## Issue
The `reservations` table has `productId` and `quantity` as NOT NULL columns, but the new `buyV2` implementation creates multi-item reservations where these fields are not used (data is stored in Redis instead).

## Solution
Run the following SQL commands to make these columns nullable:

```sql
-- Connect to your PostgreSQL database
psql -U your_username -d your_database_name

-- Make productId nullable
ALTER TABLE "reservations" ALTER COLUMN "productId" DROP NOT NULL;

-- Make quantity nullable
ALTER TABLE "reservations" ALTER COLUMN "quantity" DROP NOT NULL;
```

## Alternative: Using psql command line
```bash
psql -U your_username -d your_database_name -c "ALTER TABLE reservations ALTER COLUMN \"productId\" DROP NOT NULL;"
psql -U your_username -d your_database_name -c "ALTER TABLE reservations ALTER COLUMN quantity DROP NOT NULL;"
```

## Verify the changes
```sql
SELECT 
    column_name, 
    is_nullable, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'reservations' 
  AND column_name IN ('productId', 'quantity');
```

Expected output:
```
 column_name | is_nullable | data_type 
-------------+-------------+-----------
 productId   | YES         | uuid
 quantity    | YES         | integer
```

## After Migration
Restart the backend server:
```bash
cd server
npm run start:dev
```

Then test the "Buy Now" flow again.
