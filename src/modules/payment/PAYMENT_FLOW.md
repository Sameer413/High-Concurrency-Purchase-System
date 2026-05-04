# Payment Flow with Razorpay

## Overview
This document describes the complete payment flow using Razorpay integration.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER COMPLETES CHECKOUT FORM                                │
│    - Address information filled                                 │
│    - Ready to pay                                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. FRONTEND: Create Payment Order                              │
│    POST /payments/create                                        │
│    Body: {                                                      │
│      orderId: "uuid",                                           │
│      amount: 1000,                                              │
│      currency: "INR"                                            │
│    }                                                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. BACKEND: PaymentService.createPayment()                     │
│    ✅ Validates order exists and belongs to user               │
│    ✅ Checks order is not already paid                          │
│    ✅ Creates Razorpay order via API                            │
│    ✅ Saves payment record in DB (status: CREATED)              │
│    Returns: {                                                   │
│      paymentId: "uuid",                                         │
│      razorpayOrderId: "order_xxx",                              │
│      razorpayKeyId: "rzp_test_xxx",                             │
│      amount: 1000,                                              │
│      currency: "INR"                                            │
│    }                                                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. FRONTEND: Show Razorpay Checkout Modal                      │
│    const options = {                                            │
│      key: razorpayKeyId,                                        │
│      amount: amount * 100, // in paise                          │
│      currency: "INR",                                           │
│      order_id: razorpayOrderId,                                 │
│      handler: function(response) {                              │
│        // Payment success callback                              │
│        verifyPayment(response);                                 │
│      }                                                          │
│    };                                                           │
│    const rzp = new Razorpay(options);                           │
│    rzp.open();                                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. USER COMPLETES PAYMENT IN RAZORPAY MODAL                    │
│    - Enters card/UPI details                                    │
│    - Razorpay processes payment                                 │
│    - Returns payment details to frontend                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. FRONTEND: Verify Payment                                    │
│    POST /payments/verify                                        │
│    Body: {                                                      │
│      orderId: "uuid",                                           │
│      razorpay_order_id: "order_xxx",                            │
│      razorpay_payment_id: "pay_xxx",                            │
│      razorpay_signature: "signature_xxx"                        │
│    }                                                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. BACKEND: PaymentService.verifyPayment()                     │
│    ✅ Validates signature using Razorpay secret                 │
│    ✅ Updates payment record (status: CAPTURED)                 │
│    ✅ Updates order status to PAID                              │
│    ✅ Converts reserved stock to sold stock                     │
│    ✅ Marks reservation as COMPLETED                            │
│    Returns: {                                                   │
│      success: true,                                             │
│      orderId: "uuid",                                           │
│      orderNumber: "ORD-2026-XXX",                               │
│      status: "PAID"                                             │
│    }                                                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. FRONTEND: Show Success Page                                 │
│    - Display order confirmation                                 │
│    - Show order number                                          │
│    - Clear cart/reservation                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### 1. Create Payment Order
**Endpoint**: `POST /payments/create`

**Request**:
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "amount": 1000,
  "currency": "INR",
  "notes": "Optional notes"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Payment order created successfully",
  "data": {
    "paymentId": "payment-uuid",
    "razorpayOrderId": "order_MNqwertyuiop",
    "amount": 1000,
    "currency": "INR",
    "razorpayKeyId": "rzp_test_1234567890"
  }
}
```

---

### 2. Verify Payment
**Endpoint**: `POST /payments/verify`

**Request**:
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "razorpay_order_id": "order_MNqwertyuiop",
  "razorpay_payment_id": "pay_MNqwertyuiop",
  "razorpay_signature": "signature_hash"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Payment verified successfully",
  "data": {
    "success": true,
    "orderId": "550e8400-e29b-41d4-a716-446655440000",
    "orderNumber": "ORD-2026-ABC123",
    "paymentId": "payment-uuid",
    "status": "PAID",
    "paidAt": "2026-05-01T10:30:00Z"
  }
}
```

---

### 3. Get Payment Details
**Endpoint**: `GET /payments/:id`

**Response**:
```json
{
  "success": true,
  "message": "Payment retrieved successfully",
  "data": {
    "id": "payment-uuid",
    "orderId": "order-uuid",
    "razorpayOrderId": "order_xxx",
    "razorpayPaymentId": "pay_xxx",
    "amount": 1000,
    "currency": "INR",
    "status": "CAPTURED",
    "createdAt": "2026-05-01T10:25:00Z"
  }
}
```

---

### 4. Handle Payment Failure
**Endpoint**: `POST /payments/failure`

**Request**:
```json
{
  "orderId": "order-uuid",
  "razorpayOrderId": "order_xxx",
  "reason": "Payment declined by bank"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Payment failure recorded"
}
```

---

## Frontend Integration

### Install Razorpay SDK
```bash
npm install razorpay
```

### Add Razorpay Script
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

### Payment Component Example

```typescript
import { useCreatePaymentMutation, useVerifyPaymentMutation } from '@/features/payment/paymentApi';

function CheckoutPayment({ orderId, amount }) {
  const [createPayment] = useCreatePaymentMutation();
  const [verifyPayment] = useVerifyPaymentMutation();

  const handlePayment = async () => {
    try {
      // Step 1: Create payment order
      const { data } = await createPayment({
        orderId,
        amount,
        currency: 'INR',
      }).unwrap();

      // Step 2: Open Razorpay checkout
      const options = {
        key: data.razorpayKeyId,
        amount: data.amount * 100, // Convert to paise
        currency: data.currency,
        order_id: data.razorpayOrderId,
        name: 'Your Store Name',
        description: 'Order Payment',
        handler: async function (response) {
          // Step 3: Verify payment
          try {
            const result = await verifyPayment({
              orderId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }).unwrap();

            // Step 4: Show success
            router.push(`/order/success?orderNumber=${result.orderNumber}`);
          } catch (error) {
            console.error('Payment verification failed:', error);
            alert('Payment verification failed. Please contact support.');
          }
        },
        modal: {
          ondismiss: function () {
            console.log('Payment modal closed');
          },
        },
        theme: {
          color: '#000000',
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      console.error('Payment creation failed:', error);
      alert('Failed to initiate payment. Please try again.');
    }
  };

  return (
    <button onClick={handlePayment}>
      Pay ₹{amount}
    </button>
  );
}
```

---

## Database Schema

### Payment Table
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  razorpay_order_id VARCHAR NOT NULL,
  razorpay_payment_id VARCHAR,
  razorpay_signature VARCHAR,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  status ENUM('CREATED', 'PENDING', 'CAPTURED', 'FAILED', 'REFUNDED'),
  method VARCHAR,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Payment Status Flow

```
CREATED → PENDING → CAPTURED → (REFUNDED)
   ↓
FAILED
```

- **CREATED**: Payment order created, waiting for user action
- **PENDING**: Payment initiated by user
- **CAPTURED**: Payment successful and verified
- **FAILED**: Payment failed or signature invalid
- **REFUNDED**: Payment refunded to customer

---

## Security Considerations

### 1. Signature Verification
Always verify the Razorpay signature on the backend:
```typescript
const body = razorpay_order_id + '|' + razorpay_payment_id;
const expectedSignature = crypto
  .createHmac('sha256', RAZORPAY_SECRET)
  .update(body)
  .digest('hex');

if (expectedSignature !== razorpay_signature) {
  throw new Error('Invalid signature');
}
```

### 2. Amount Validation
Always validate the amount on the backend before creating the order.

### 3. Idempotency
Prevent duplicate payments by checking if payment already exists for the order.

### 4. Transaction Safety
Use database transactions to ensure atomic updates:
- Update payment status
- Update order status
- Convert reserved stock to sold

---

## Error Handling

### Payment Creation Errors
- Order not found
- Order already paid
- Razorpay API error

### Payment Verification Errors
- Invalid signature
- Payment not found
- Order not found
- Insufficient reserved stock

### Frontend Error Handling
```typescript
try {
  await verifyPayment(data);
} catch (error) {
  if (error.status === 400) {
    // Invalid signature
    alert('Payment verification failed');
  } else if (error.status === 404) {
    // Order/payment not found
    alert('Order not found');
  } else {
    // Generic error
    alert('Something went wrong');
  }
}
```

---

## Testing

### Test Mode
Use Razorpay test credentials:
- Key ID: `rzp_test_xxxxxxxxxx`
- Key Secret: `test_secret_xxxxxxxxxx`

### Test Cards
- **Success**: 4111 1111 1111 1111
- **Failure**: 4000 0000 0000 0002

### Test UPI
- **Success**: success@razorpay
- **Failure**: failure@razorpay

---

## Environment Variables

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx
RAZORPAY_KEY_SECRET=test_secret_xxxxxxxxxx
```

---

## Related Documentation
- [Order Flow](../order/ORDER_FLOW.md)
- [Inventory Management](../inventory/README.md)
- [Razorpay Documentation](https://razorpay.com/docs/)
