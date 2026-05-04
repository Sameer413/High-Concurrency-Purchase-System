# Product Purchase API Flow Architecture

This document outlines the server-side API flow and architecture for purchasing a product. The flow is designed to prevent overselling, ensure data consistency, and handle concurrent requests safely.

## Architecture Overview

The purchase flow relies on a multi-step process utilizing **Database Row-Level Locking** (or Redis distributed locks) to ensure stock consistency. The process involves creating a temporary reservation, transitioning it to a confirmed order, and processing the payment securely.

### Phase 1: Stock Reservation
**Endpoint**: `POST /api/v1/reservations`

1. **Client Action**: User clicks "Buy Now".
2. **Server Logic**:
   - Begins a database transaction.
   - Acquires a row-level lock on the specific product (`SELECT ... FOR UPDATE`) to prevent concurrent modifications.
   - Checks if `availableStock >= requestedQuantity`.
   - If sufficient stock exists:
     - Decrements `availableStock`.
     - Creates a `Reservation` record with a `pending` status and an expiration time (e.g., 15 minutes).
   - Commits transaction.
3. **Response**: Returns `reservationId` and `expiresAt`.

### Phase 2: Order Creation
**Endpoint**: `POST /api/v1/orders`

1. **Client Action**: User submits shipping/billing details and confirms the order placement.
2. **Server Logic**:
   - Validates the provided `reservationId` (ensures it belongs to the user and is not expired).
   - Calculates exact totals (subtotal, taxes, shipping).
   - Begins a database transaction.
   - Creates an `Order` record (status: `pending_payment`).
   - Creates `OrderItem` records linked to the order.
   - Associates the `Reservation` with the newly created `Order`.
   - Commits transaction.
3. **Response**: Returns `orderId`, `totalAmount`, and `status`.

### Phase 3: Payment Initialization
**Endpoint**: `POST /api/v1/payments/intent` (or equivalent)

1. **Client Action**: Client requests a payment session/intent.
2. **Server Logic**:
   - Looks up the `Order` by `orderId`.
   - Validates the order status (`pending_payment`).
   - Calls the Payment Gateway API (e.g., Stripe) to create a PaymentIntent.
   - Saves the `paymentIntentId` to the `Order` record.
3. **Response**: Returns `clientSecret` or `paymentToken` to the client for secure checkout.

### Phase 4: Payment Confirmation & Webhooks
**Endpoint**: `POST /api/v1/webhooks/payment`

1. **Gateway Action**: Payment provider sends an asynchronous webhook event upon payment success or failure.
2. **Server Logic**:
   - Validates the webhook signature to ensure authenticity.
   - If **Success**:
     - Updates `Order` status to `confirmed` / `paid`.
     - Updates `Reservation` status to `confirmed` (stock is permanently deducted).
   - If **Failure**:
     - Updates `Order` status to `failed`.
     - Reverts `Reservation` and increments the product's `availableStock`.

### Phase 5: Abandoned Reservation Cleanup (Background Job)
**Mechanism**: Cron Job / BullMQ Worker

1. **Trigger**: Runs periodically (e.g., every minute).
2. **Server Logic**:
   - Queries `Reservation` table for records where `status = 'pending'` AND `expiresAt < NOW()`.
   - Begins a transaction.
   - For each expired reservation:
     - Updates status to `expired` or `cancelled`.
     - Restores the reserved quantity back to the product's `availableStock`.
   - Commits transaction.

---

## Data Consistency & Fault Tolerance

- **Race Conditions**: Prevented during the reservation phase via row-level locking. If two users try to buy the last item simultaneously, the database lock ensures they are processed sequentially, and the second user will receive an "Out of Stock" error.
- **Idempotency**: Webhook endpoints and payment confirmation endpoints are idempotent. Re-processing a successful webhook will not double-confirm the order or double-deduct stock.
- **Orphaned Reservations**: If a user closes their browser after step 1 without completing the purchase, the background cleanup job guarantees that the locked inventory is released back to the pool automatically.
