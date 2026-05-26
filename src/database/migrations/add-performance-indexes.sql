-- ============================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- ============================================
-- Created: 2026-05-06
-- Purpose: Improve query performance based on load test results
-- Target: Reduce P99 latency from 15s to <2s

-- ============================================
-- INVENTORY TABLE INDEXES
-- ============================================
-- Most critical: productId lookups happen on every reservation
CREATE INDEX IF NOT EXISTS idx_inventory_product_id 
ON inventory("productId");

-- For stock availability checks
CREATE INDEX IF NOT EXISTS idx_inventory_available_stock 
ON inventory(("totalStock" - "reservedStock")) 
WHERE "totalStock" - "reservedStock" > 0;

-- ============================================
-- RESERVATIONS TABLE INDEXES
-- ============================================
-- Critical: Lookup by reservationId during checkout
CREATE INDEX IF NOT EXISTS idx_reservations_id 
ON reservations(id);

-- For cleanup jobs: find expired reservations
CREATE INDEX IF NOT EXISTS idx_reservations_status_expires 
ON reservations(status, "expiresAt") 
WHERE status = 'ACTIVE';

-- For user's active reservations
CREATE INDEX IF NOT EXISTS idx_reservations_user_status 
ON reservations("userId", status);

-- ============================================
-- ORDERS TABLE INDEXES
-- ============================================
-- Critical: Lookup by reservationId (unique constraint already creates index)
-- CREATE INDEX IF NOT EXISTS idx_orders_reservation_id 
-- ON orders("reservationId");

-- For user's order history
CREATE INDEX IF NOT EXISTS idx_orders_user_created 
ON orders("userId", "createdAt" DESC);

-- For order status queries
CREATE INDEX IF NOT EXISTS idx_orders_status 
ON orders(status);

-- For payment processing: find pending orders
CREATE INDEX IF NOT EXISTS idx_orders_status_created 
ON orders(status, "createdAt") 
WHERE status IN ('PENDING', 'PAID');

-- ============================================
-- ORDER_ITEMS TABLE INDEXES
-- ============================================
-- For order details lookup
CREATE INDEX IF NOT EXISTS idx_order_items_order_id 
ON order_items("orderId");

-- For product sales analytics
CREATE INDEX IF NOT EXISTS idx_order_items_product_id 
ON order_items("productId");

-- ============================================
-- PAYMENTS TABLE INDEXES
-- ============================================
-- Critical: Lookup by orderId during payment verification
CREATE INDEX IF NOT EXISTS idx_payments_order_id 
ON payments("orderId");

-- For idempotency checks
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key 
ON payments("idempotencyKey") 
WHERE "idempotencyKey" IS NOT NULL;

-- For Razorpay webhook processing
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id 
ON payments("razorpayOrderId");

-- For payment status queries
CREATE INDEX IF NOT EXISTS idx_payments_status 
ON payments(status);

-- ============================================
-- PRODUCTS TABLE INDEXES
-- ============================================
-- For product listing and filtering
CREATE INDEX IF NOT EXISTS idx_products_active 
ON products("isActive") 
WHERE "isActive" = true;

-- For category filtering
CREATE INDEX IF NOT EXISTS idx_products_category 
ON products(category);

-- For search and sorting
CREATE INDEX IF NOT EXISTS idx_products_name 
ON products(name);

-- For price range queries
CREATE INDEX IF NOT EXISTS idx_products_price 
ON products(price);

-- Composite index for common queries (active products by category)
CREATE INDEX IF NOT EXISTS idx_products_active_category 
ON products("isActive", category) 
WHERE "isActive" = true;

-- ============================================
-- USERS TABLE INDEXES
-- ============================================
-- Email lookup (likely already has unique constraint)
CREATE INDEX IF NOT EXISTS idx_users_email 
ON users(email);

-- For active users
CREATE INDEX IF NOT EXISTS idx_users_active 
ON users("isActive") 
WHERE "isActive" = true;

-- ============================================
-- ANALYZE TABLES
-- ============================================
-- Update statistics for query planner
ANALYZE inventory;
ANALYZE reservations;
ANALYZE orders;
ANALYZE order_items;
ANALYZE payments;
ANALYZE products;
ANALYZE users;
