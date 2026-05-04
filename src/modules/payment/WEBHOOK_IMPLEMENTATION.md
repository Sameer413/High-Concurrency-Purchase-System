# Razorpay Webhook Implementation

## Overview

This document describes the webhook implementation for handling asynchronous payment updates from Razorpay. Webhooks provide a reliable way to receive payment status updates even if the user closes the browser or loses connection.

## Why Webhooks?

### Problems Without Webhooks:
- ❌ User closes browser before payment verification
- ❌ Network issues during payment
- ❌ Frontend verification fails but payment succeeded
- ❌ No way to handle delayed payment captures
- ❌ Manual reconciliation required

### Benefits With Webhooks:
- ✅ Reliable payment status updates
- ✅ Works even if user closes browser
- ✅ Automatic order completion
- ✅ Handles all payment states
- ✅ No manual reconciliation needed
- ✅ Better customer experience

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Payment Flow with Webhooks                  │
└─────────────────────────────────────────────────────────────────┘

Frontend                Backend                 Razorpay
   │                       │                        │
   │  1. Create Payment    │                        │
   ├──────────────────────>│                        │
   │                       │  2. Create Order       │
   │                       ├───────────────────────>│
   │                       │                        │
   │                       │  3. Order Created      │
   │                       │<───────────────────────┤
   │  4. Payment Details   │                        │
   │<──────────────────────┤                        │
   │                       │                        │
   │  5. Open Razorpay     │                        │
   │  Modal                │                        │
   │                       │                        │
   │  6. User Pays         │                        │
   ├───────────────────────────────────────────────>│
   │                       │                        │
   │  7. Payment Success   │                        │
   │<───────────────────────────────────────────────┤
   │                       │                        │
   │  8. Verify Payment    │                        │
   ├──────────────────────>│                        │
   │                       │  9. Verify Signature   │
   │                       ├───────────────────────>│
   │                       │                        │
   │ 10. Success Response  │                        │
   │<──────────────────────┤                        │
   │                       │                        │
   │                       │ 11. Webhook: payment.captured
   │                       │<───────────────────────┤
   │                       │                        │
   │                       │ 12. Process Webhook    │
   │                       │    - Update Payment    │
   │                       │    - Complete Order    │
   │                       │    - Convert Stock     │
   │                       │                        │
   │                       │ 13. Acknowledge        │
   │                       ├───────────────────────>│
   │                       │                        │
```

## Webhook Events

### Supported Events

1. **payment.authorized**
   - Payment is authorized but not yet captured
   - Status: PENDING
   - Action: Update payment record with authorization details

2. **payment.captured**
   - Payment is successfully captured (final success state)
   - Status: CAPTURED
   - Action: Complete order, convert reserved stock to sold

3. **payment.failed**
   - Payment failed
   - Status: FAILED
   - Action: Update payment with error details

4. **order.paid**
   - Order is marked as paid
   - Action: Update payment metadata

5. **refund.created** (Future)
   - Refund initiated
   - Action: Create refund record

6. **refund.processed** (Future)
   - Refund completed
   - Action: Update refund status

7. **refund.failed** (Future)
   - Refund failed
   - Action: Update refund with error

## Implementation

### 1. Webhook Endpoint

**URL:** `POST /payments/webhook`

**Features:**
- Public endpoint (no authentication required)
- Signature verification for security
- Idempotent processing
- Error handling
- Logging

**Request:**
```typescript
Headers:
  x-razorpay-signature: <signature>

Body:
{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_xxx",
        "order_id": "order_xxx",
        "amount": 10000,
        "currency": "INR",
        "status": "captured",
        "method": "upi",
        "email": "user@example.com",
        "contact": "+919876543210",
        ...
      }
    }
  },
  "account_id": "acc_xxx",
  "contains": ["payment"],
  "created_at": 1234567890
}
```

**Response:**
```typescript
{
  "status": "ok"
}
```

### 2. Signature Verification

```typescript
async verifyWebhookSignature(body: string, signature: string): Promise<boolean> {
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  
  return expectedSignature === signature;
}
```

### 3. Event Handlers

#### Payment Authorized Handler

```typescript
async handlePaymentAuthorized(paymentEntity: any) {
  // Find payment by razorpayOrderId
  const payment = await this.paymentRepo.findOne({
    where: { razorpayOrderId: paymentEntity.order_id },
  });

  // Update payment status to PENDING
  payment.razorpayPaymentId = paymentEntity.id;
  payment.status = PaymentStatus.PENDING;
  payment.method = paymentEntity.method;
  payment.metadata = {
    ...payment.metadata,
    authorizedAt: new Date().toISOString(),
    webhookData: { ... },
  };

  await this.paymentRepo.save(payment);
}
```

#### Payment Captured Handler

```typescript
async handlePaymentCaptured(paymentEntity: any) {
  return await this.dataSource.transaction(async (manager) => {
    // Find payment
    const payment = await manager.findOne(Payment, {
      where: { razorpayOrderId: paymentEntity.order_id },
      relations: ['order', 'order.items'],
    });

    // Check if already processed (idempotency)
    if (payment.status === PaymentStatus.CAPTURED) {
      return; // Already processed
    }

    // Update payment
    payment.status = PaymentStatus.CAPTURED;
    payment.razorpayPaymentId = paymentEntity.id;
    await manager.save(payment);

    // Update order
    order.status = 'PAID';
    order.paidAt = new Date();
    await manager.save(order);

    // Convert reserved stock to sold
    for (const item of order.items) {
      await this.inventoryService.confirmSaleTx(
        manager,
        item.productId,
        item.quantity,
      );
    }

    // Mark reservation as completed
    reservation.status = ReservationStatus.COMPLETED;
    await reservationRepo.save(reservation);
  });
}
```

#### Payment Failed Handler

```typescript
async handlePaymentFailedWebhook(paymentEntity: any) {
  const payment = await this.paymentRepo.findOne({
    where: { razorpayOrderId: paymentEntity.order_id },
  });

  payment.status = PaymentStatus.FAILED;
  payment.metadata = {
    ...payment.metadata,
    failedAt: new Date().toISOString(),
    webhookData: {
      error_code: paymentEntity.error_code,
      error_description: paymentEntity.error_description,
      error_source: paymentEntity.error_source,
      error_step: paymentEntity.error_step,
      error_reason: paymentEntity.error_reason,
    },
  };

  await this.paymentRepo.save(payment);
}
```

## Setup Instructions

### 1. Configure Webhook in Razorpay Dashboard

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/app/webhooks)
2. Click "Add New Webhook"
3. Enter webhook URL: `https://your-domain.com/payments/webhook`
4. Select events to subscribe:
   - ✅ payment.authorized
   - ✅ payment.captured
   - ✅ payment.failed
   - ✅ order.paid
5. Set webhook secret (copy this for environment variables)
6. Set alert email for webhook failures
7. Click "Create Webhook"

### 2. Environment Variables

Add to `.env`:

```bash
# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxx  # From Razorpay Dashboard
```

### 3. Make Endpoint Public

The webhook endpoint must be accessible without authentication:

```typescript
@Public() // Bypass JWT authentication
@Post('webhook')
async handleWebhook(...) { ... }
```

### 4. Enable Raw Body

For signature verification, we need access to the raw request body:

In `main.ts`:
```typescript
app.use(
  '/payments/webhook',
  express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
```

## Security

### 1. Signature Verification

**Always verify webhook signature:**
```typescript
const isValid = await this.razorpayService.verifyWebhookSignature(
  rawBody,
  signature,
);

if (!isValid) {
  throw new UnauthorizedException('Invalid webhook signature');
}
```

### 2. Idempotency

**Check if already processed:**
```typescript
if (payment.status === PaymentStatus.CAPTURED) {
  return; // Already processed, skip
}
```

### 3. IP Whitelisting (Optional)

Razorpay webhook IPs:
- 52.66.193.64
- 52.66.193.65
- 52.66.193.66

Add to firewall or application-level check.

### 4. HTTPS Only

Webhooks should only be received over HTTPS in production.

## Error Handling

### 1. Invalid Signature

```typescript
if (!isValid) {
  this.logger.warn('Invalid webhook signature received');
  throw new UnauthorizedException('Invalid webhook signature');
}
```

### 2. Payment Not Found

```typescript
if (!payment) {
  this.logger.warn(`Payment not found for order: ${orderEntity.id}`);
  return; // Log and skip
}
```

### 3. Processing Errors

```typescript
try {
  await this.paymentService.handlePaymentCaptured(entity);
} catch (error) {
  this.logger.error('Webhook processing error:', error);
  // Still return 200 to prevent Razorpay retries
  return { status: 'error', message: 'Processing failed' };
}
```

## Testing

### 1. Local Testing with ngrok

```bash
# Install ngrok
npm install -g ngrok

# Start your server
npm run start:dev

# Expose local server
ngrok http 3000

# Use ngrok URL in Razorpay Dashboard
https://xxxx.ngrok.io/payments/webhook
```

### 2. Test Webhook Manually

```bash
curl -X POST https://your-domain.com/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-razorpay-signature: <signature>" \
  -d '{
    "event": "payment.captured",
    "payload": {
      "payment": {
        "entity": {
          "id": "pay_test123",
          "order_id": "order_test123",
          "amount": 10000,
          "currency": "INR",
          "status": "captured",
          "method": "upi"
        }
      }
    }
  }'
```

### 3. Razorpay Test Mode

In test mode, you can trigger webhooks from Razorpay Dashboard:
1. Go to Webhooks section
2. Click on your webhook
3. Click "Send Test Webhook"
4. Select event type
5. Click "Send"

## Monitoring

### 1. Logging

All webhook events are logged:
```typescript
this.logger.log(`Webhook received: ${payload.event}`);
this.logger.log(`Payment captured: ${payment.id}`);
this.logger.warn(`Payment failed: ${payment.id}`);
this.logger.error('Webhook processing error:', error);
```

### 2. Webhook Dashboard

Monitor webhooks in Razorpay Dashboard:
- Delivery status
- Response codes
- Retry attempts
- Failure reasons

### 3. Alerts

Set up alerts for:
- Webhook failures
- Invalid signatures
- Processing errors
- High failure rates

## Troubleshooting

### Webhook Not Received

1. **Check URL is correct**
   - Verify in Razorpay Dashboard
   - Must be publicly accessible
   - Must use HTTPS in production

2. **Check endpoint is public**
   - `@Public()` decorator present
   - Not blocked by authentication

3. **Check firewall**
   - Allow Razorpay IPs
   - Port is open

### Invalid Signature

1. **Check webhook secret**
   - Correct in environment variables
   - Matches Razorpay Dashboard

2. **Check raw body**
   - Raw body middleware configured
   - Body not parsed before verification

### Payment Not Updated

1. **Check logs**
   - Webhook received?
   - Processing errors?

2. **Check payment status**
   - Already processed?
   - Correct razorpayOrderId?

3. **Check database**
   - Payment record exists?
   - Transaction committed?

## Best Practices

1. **Always verify signature** - Never trust webhook without verification
2. **Implement idempotency** - Handle duplicate webhooks gracefully
3. **Return 200 quickly** - Process async if needed
4. **Log everything** - Essential for debugging
5. **Handle all events** - Even if just logging
6. **Use transactions** - Ensure data consistency
7. **Monitor webhooks** - Set up alerts
8. **Test thoroughly** - Use test mode extensively

## Webhook vs Frontend Verification

### Both Are Important!

**Frontend Verification:**
- Immediate feedback to user
- Better user experience
- Handles 99% of cases

**Webhook:**
- Backup for edge cases
- Handles network issues
- Ensures no payment is missed
- Required for compliance

### Recommended Flow:

1. User completes payment
2. Frontend verifies immediately
3. Show success to user
4. Webhook processes in background
5. If webhook finds discrepancy, send notification

## Future Enhancements

1. **Webhook Retry Logic**
   - Implement exponential backoff
   - Store failed webhooks for retry

2. **Webhook Queue**
   - Use message queue (Redis, RabbitMQ)
   - Process webhooks asynchronously

3. **Webhook Analytics**
   - Track webhook delivery rates
   - Monitor processing times
   - Alert on anomalies

4. **Refund Webhooks**
   - Implement refund handlers
   - Auto-update order status
   - Restore inventory

5. **Webhook Replay**
   - Store webhook payloads
   - Allow manual replay
   - Useful for debugging

## Conclusion

Webhooks provide a reliable way to handle payment updates asynchronously. They ensure that no payment is missed, even if the user closes the browser or loses connection. Combined with frontend verification, they provide a robust payment processing system.

---

**Implementation Date:** May 2, 2026  
**Status:** ✅ Complete  
**Version:** 1.0.0
