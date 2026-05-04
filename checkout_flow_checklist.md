# E-Commerce Purchase Flow Checklist

Here is a comprehensive breakdown of your current e-commerce purchase architecture. You have completed the hardest and most complex parts of a distributed e-commerce backend.

## ✅ Phase 1: Stock Management & Reservations (Completed)
- [x] **Inventory Tracking**: Accurate schema for tracking available and reserved stock.
- [x] **Atomic Reservations**: Safe "Buy Now" flow that holds stock temporarily when a user initiates checkout.
- [x] **Race Condition Prevention**: Implemented database-level locks (or Redis locks) to ensure two users cannot reserve the last remaining stock simultaneously.
- [x] **Automated Stock Cleanup**: Cron job (`reservation-cleanup.service.ts`) automatically frees up stock from abandoned carts if the user doesn't complete the payment within the time limit.

## ✅ Phase 2: Checkout & Order Creation (Completed)
- [x] **Frontend Validation**: Zod-based address and user details validation before order creation.
- [x] **Order Initialization API**: Securely creates the initial `Order` record in Postgres with a `PENDING` status.
- [x] **Idempotency**: Included `Idempotency-Key` headers so that if the frontend retries a network request, it doesn't create duplicate database orders.
- [x] **Data Integrity**: Enforced foreign keys between User, Order, Payment, and Reservation entities.

## ✅ Phase 3: Payment Integration (Completed)
- [x] **Razorpay Order Creation**: Backend securely generates a Razorpay order and passes the `razorpayOrderId` back to the frontend.
- [x] **Frontend Payment Modal**: Correct implementation of the Razorpay JS SDK to securely capture card/UPI details.
- [x] **Frontend Verification API**: User's browser immediately pings the backend `verify` endpoint to finalize the order upon success.
- [x] **Cryptographic Signature Verification**: Backend mathematically verifies the Razorpay signature to prevent tampered or fake payments.

## ✅ Phase 4: Webhooks & Edge Cases (Completed)
- [x] **Webhook Endpoint**: Public endpoint designed to catch background events from Razorpay.
- [x] **Webhook Security**: Verifying `x-razorpay-signature` headers to ensure webhooks actually came from Razorpay.
- [x] **Pessimistic Locking**: Wraps payment verifications in a Postgres transaction with `lock: { mode: 'pessimistic_write' }` to handle the race condition where the Frontend Callback and the Webhook hit your server at the exact same millisecond.
- [x] **Late Payment Resolution**: Safely catches payments that succeed *after* the reservation cron job expired the stock. Marks these orders as `NEEDS_REFUND` instead of overselling nonexistent inventory.
- [x] **Failed Payment Handling**: Correctly releases reserved stock back to the public pool if the user's card declines.

---

## ⏳ Phase 5: "Nice to Have" / Remaining Tasks
These are items that are not strictly necessary to launch a working store, but are important for day-to-day operations and customer experience.

- [ ] **Refund API (Admin)**: Create a secure backend endpoint for admins to automatically process refunds for orders marked `NEEDS_REFUND` (using the Razorpay Refunds API).
- [ ] **Transactional Emails/SMS**: Integrate a service (AWS SES, Resend, or Twilio) to send an "Order Confirmed" receipt to the user's email after successful payment.
- [ ] **Invoice Generation**: Auto-generate a PDF invoice for the completed order and attach it to the confirmation email or allow users to download it from their dashboard.
- [ ] **Order Status Webhook**: (Optional) If you plan to integrate a 3rd party shipping provider (like Shiprocket or Delhivery), you'll need to set up their webhooks to update the order status from `PAID` -> `SHIPPED` -> `DELIVERED`.
- [ ] **Frontend Error Recovery UI**: Add a UI state that detects if a user has an incomplete/interrupted payment pending and allows them to easily click "Resume Payment" without re-entering their address.
