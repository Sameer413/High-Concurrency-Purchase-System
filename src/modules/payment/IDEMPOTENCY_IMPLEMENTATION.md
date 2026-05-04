# Idempotency Implementation Guide

## Overview

Idempotency ensures that making the same API request multiple times has the same effect as making it once. This is critical for payment operations to prevent duplicate charges due to network issues, retries, or user actions.

## What is Idempotency?

**Idempotency** means that multiple identical requests produce the same result as a single request.

### Example Scenario:
```
User clicks "Pay Now"
  ↓
Request sent to server
  ↓
Network timeout (no response received)
  ↓
User clicks "Pay Now" again (retry)
  ↓
WITHOUT idempotency: Two payments created ❌
WITH idempotency: Same payment returned ✅
```

## Implementation

### 1. Header-Based Idempotency (Industry Standard)

We use the **Idempotency-Key** header (same as Stripe, PayPal, etc.)

#### Request Format:
```http
POST /payments/create
Headers:
  Authorization: Bearer <token>
  Idempotency-Key: idem_user123_order456_1234567890
  Content-Type: application/json

Body:
{
  "orderId": "order-uuid",
  "amount": 10000,
  "currency": "INR"
}
```

#### Response Format:
```json
{
  "success": true,
  "message": "Payment order created successfully",
  "data": {
    "paymentId": "pay-uuid",
    "razorpayOrderId": "order_xxx",
    "amount": 10000,
    "currency": "INR",
    "razorpayKeyId": "rzp_test_xxx",
    "idempotent": false  // false = new, true = cached
  }
}
```

### 2. Backend Implementation

#### Controller (`payment.controller.ts`)
```typescript
@Post('create')
@HttpCode(HttpStatus.CREATED)
async createPayment(
  @Body() dto: CreatePaymentDto,
  @CurrentUser() user: User,
  @Headers('idempotency-key') idempotencyKey?: string,
) {
  const payment = await this.paymentService.createPayment(
    dto,
    user.id,
    idempotencyKey,
  );
  return this.responseService.success(
    payment,
    'Payment order created successfully',
  );
}
```

#### Service (`payment.service.ts`)
```typescript
async createPayment(
  dto: CreatePaymentDto,
  userId: string,
  idempotencyKey?: string,
) {
  // 1. Check idempotency key first (if provided)
  if (idempotencyKey) {
    const existingByKey = await this.paymentRepo.findOne({
      where: { idempotencyKey },
    });

    if (existingByKey) {
      // Return cached response
      return {
        paymentId: existingByKey.id,
        razorpayOrderId: existingByKey.razorpayOrderId,
        amount: existingByKey.amount,
        currency: existingByKey.currency,
        razorpayKeyId: this.razorpayService.getPublicKey(),
        idempotent: true,
      };
    }
  }

  // 2. Create new payment
  const payment = this.paymentRepo.create({
    ...dto,
    idempotencyKey: idempotencyKey || null,
  });

  await this.paymentRepo.save(payment);

  return {
    paymentId: payment.id,
    // ... other fields
    idempotent: false,
  };
}
```

#### Entity (`payment.entity.ts`)
```typescript
@Entity('payments')
export class Payment extends BaseEntity {
  // Unique index to prevent duplicate payments
  @Index({ unique: true, where: 'idempotencyKey IS NOT NULL' })
  @Column({ nullable: true, length: 255 })
  idempotencyKey!: string | null;
  
  // ... other fields
}
```

### 3. Frontend Implementation

#### Generate Idempotency Key
```typescript
// utils/idempotency.ts
export function generateIdempotencyKey(
  userId: string,
  orderId: string,
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `idem_${userId}_${orderId}_${timestamp}_${random}`;
}
```

#### Use in API Call
```typescript
// features/payment/paymentApi.ts
createPayment: builder.mutation({
  query: (body) => {
    const idempotencyKey = generateIdempotencyKey(
      body.userId,
      body.orderId,
    );
    
    return {
      url: '/payments/create',
      method: 'POST',
      body,
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    };
  },
}),
```

#### Store and Reuse Key
```typescript
// Store key for retries
const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

const handlePayment = async () => {
  // Generate key once
  const key = idempotencyKey || generateIdempotencyKey(userId, orderId);
  setIdempotencyKey(key);

  try {
    const response = await createPayment({
      orderId,
      amount,
      currency: 'INR',
    }, {
      headers: {
        'Idempotency-Key': key,
      },
    });

    if (response.data.idempotent) {
      console.log('Idempotent request - using cached payment');
    }
  } catch (error) {
    // On error, keep the same key for retry
    console.error('Payment failed, retry with same key');
  }
};
```

## Idempotency Key Format

### Recommended Format:
```
idem_{userId}_{orderId}_{timestamp}_{random}
```

### Examples:
```
idem_user123_order456_1234567890_abc123
idem_550e8400_e29b41d4_1714567890_xyz789
```

### Key Components:
- **Prefix:** `idem_` - Identifies as idempotency key
- **User ID:** Unique user identifier
- **Order ID:** Unique order identifier
- **Timestamp:** Current timestamp (milliseconds)
- **Random:** Random string for uniqueness

### Key Requirements:
- ✅ Unique per payment attempt
- ✅ Deterministic for retries (same key for same attempt)
- ✅ Max length: 255 characters
- ✅ URL-safe characters only
- ✅ No sensitive information

## Multi-Layer Idempotency

We implement **three layers** of idempotency protection:

### Layer 1: Idempotency Key (Primary)
```typescript
if (idempotencyKey) {
  const existing = await findByIdempotencyKey(idempotencyKey);
  if (existing) return existing;
}
```
**Purpose:** Prevent duplicate requests with same key

### Layer 2: Order-Based (Fallback)
```typescript
const existing = await findByOrderId(orderId, status: 'CREATED');
if (existing) return existing;
```
**Purpose:** Prevent multiple payments for same order

### Layer 3: Webhook Status Check
```typescript
if (payment.status === 'CAPTURED') {
  return; // Already processed
}
```
**Purpose:** Prevent duplicate webhook processing

## Database Schema

### Migration
```sql
-- Add idempotency key column
ALTER TABLE payments 
ADD COLUMN idempotencyKey VARCHAR(255) NULL;

-- Create unique partial index (only for non-null keys)
CREATE UNIQUE INDEX idx_payments_idempotency_key 
ON payments (idempotencyKey) 
WHERE idempotencyKey IS NOT NULL;

-- Add indexes for performance
CREATE INDEX idx_payments_razorpay_order_id ON payments (razorpayOrderId);
CREATE INDEX idx_payments_razorpay_payment_id ON payments (razorpayPaymentId);
```

### Why Partial Index?
```sql
WHERE idempotencyKey IS NOT NULL
```
- Allows multiple NULL values (for requests without idempotency key)
- Enforces uniqueness only for non-NULL keys
- Better performance (smaller index)

## Testing

### Test 1: Duplicate Request with Same Key
```bash
# First request
curl -X POST http://localhost:3000/payments/create \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: idem_test_123" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order-123",
    "amount": 10000,
    "currency": "INR"
  }'

# Response: { "idempotent": false, "paymentId": "pay-1" }

# Second request (same key)
curl -X POST http://localhost:3000/payments/create \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: idem_test_123" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order-123",
    "amount": 10000,
    "currency": "INR"
  }'

# Response: { "idempotent": true, "paymentId": "pay-1" }
# Same payment returned!
```

### Test 2: Different Keys
```bash
# Request 1
curl ... -H "Idempotency-Key: idem_test_123"
# Response: { "paymentId": "pay-1" }

# Request 2 (different key)
curl ... -H "Idempotency-Key: idem_test_456"
# Response: Error - Order already has pending payment
```

### Test 3: No Idempotency Key
```bash
# Request without key
curl -X POST http://localhost:3000/payments/create \
  -H "Authorization: Bearer <token>" \
  -d '{ "orderId": "order-123", ... }'

# Falls back to order-based idempotency
```

## Best Practices

### 1. Always Use Idempotency Keys
```typescript
// ✅ Good
const key = generateIdempotencyKey(userId, orderId);
await createPayment(data, { headers: { 'Idempotency-Key': key } });

// ❌ Bad
await createPayment(data); // No idempotency protection
```

### 2. Store Key for Retries
```typescript
// ✅ Good - Reuse same key on retry
const [key] = useState(() => generateIdempotencyKey());
const retry = () => createPayment(data, { headers: { 'Idempotency-Key': key } });

// ❌ Bad - Generate new key on retry
const retry = () => {
  const newKey = generateIdempotencyKey(); // Different key!
  createPayment(data, { headers: { 'Idempotency-Key': newKey } });
};
```

### 3. Check Idempotent Flag
```typescript
const response = await createPayment(data);

if (response.data.idempotent) {
  console.log('Using cached payment - no new charge');
} else {
  console.log('New payment created');
}
```

### 4. Handle Errors Properly
```typescript
try {
  await createPayment(data, { headers: { 'Idempotency-Key': key } });
} catch (error) {
  if (error.status === 409) {
    // Conflict - payment already exists
    console.log('Payment already created');
  } else {
    // Other error - safe to retry with same key
    console.log('Retry with same key');
  }
}
```

### 5. Key Expiration (Optional)
```typescript
// Include timestamp in key
const key = `idem_${userId}_${orderId}_${Date.now()}`;

// Backend: Check if key is too old (e.g., > 24 hours)
const keyAge = Date.now() - extractTimestamp(idempotencyKey);
if (keyAge > 24 * 60 * 60 * 1000) {
  // Key expired, allow new payment
}
```

## Security Considerations

### 1. User Isolation
```typescript
// ✅ Always verify ownership
const payment = await findByIdempotencyKey(key);
if (payment && payment.order.userId !== currentUserId) {
  throw new UnauthorizedException();
}
```

### 2. Key Validation
```typescript
// Validate key format
if (idempotencyKey && !isValidIdempotencyKey(idempotencyKey)) {
  throw new BadRequestException('Invalid idempotency key format');
}

function isValidIdempotencyKey(key: string): boolean {
  return /^idem_[a-zA-Z0-9_-]{1,240}$/.test(key);
}
```

### 3. Rate Limiting
```typescript
// Limit requests per key
const requestCount = await redis.incr(`idem:${key}:count`);
if (requestCount > 10) {
  throw new TooManyRequestsException();
}
```

## Monitoring

### Metrics to Track
```typescript
// 1. Idempotent request rate
const idempotentRate = idempotentRequests / totalRequests;

// 2. Key reuse frequency
const keyReuseCount = await countByIdempotencyKey(key);

// 3. Failed idempotency checks
if (existingPayment && existingPayment.amount !== dto.amount) {
  logger.warn('Idempotency key reused with different amount');
}
```

### Logging
```typescript
this.logger.log(
  `Idempotent request detected: ${idempotencyKey}, ` +
  `returning existing payment: ${existingPayment.id}`
);

this.logger.log(
  `Payment created: ${payment.id} ` +
  `with idempotency key: ${idempotencyKey}`
);
```

## Troubleshooting

### Issue: Duplicate Payments Created
**Cause:** Idempotency key not sent or different keys used
**Solution:** Always send same key for retries

### Issue: "Idempotency key already used" Error
**Cause:** Trying to create different payment with same key
**Solution:** Generate new key for new payment attempt

### Issue: Cached Response is Stale
**Cause:** Payment status changed after initial creation
**Solution:** Check payment status before returning cached response

## Comparison with Other Approaches

| Approach | Pros | Cons |
|----------|------|------|
| **Idempotency Key (Header)** | ✅ Industry standard<br>✅ Client-controlled<br>✅ Flexible | ⚠️ Requires client implementation |
| **Order-Based** | ✅ Simple<br>✅ No client changes | ❌ Limited to one payment per order<br>❌ No retry support |
| **Request Hash** | ✅ Automatic | ❌ Not reliable<br>❌ Hard to debug |
| **Database Constraints** | ✅ Guaranteed uniqueness | ❌ Not flexible<br>❌ Poor error messages |

## Conclusion

Idempotency is **critical** for payment systems. Our implementation provides:

- ✅ **Header-based** idempotency (industry standard)
- ✅ **Multi-layer** protection (key + order + webhook)
- ✅ **Database-enforced** uniqueness
- ✅ **Client-friendly** API
- ✅ **Comprehensive** logging and monitoring

---

**Implementation Date:** May 2, 2026  
**Status:** ✅ Complete  
**Version:** 1.0.0
