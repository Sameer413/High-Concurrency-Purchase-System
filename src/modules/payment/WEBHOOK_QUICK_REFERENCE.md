# Webhook Quick Reference

## Endpoint

```
POST /payments/webhook
```

## Headers

```
Content-Type: application/json
x-razorpay-signature: <signature>
```

## Events

| Event | Handler | Action |
|-------|---------|--------|
| `payment.authorized` | `handlePaymentAuthorized()` | Update to PENDING |
| `payment.captured` | `handlePaymentCaptured()` | Complete order + Convert stock |
| `payment.failed` | `handlePaymentFailedWebhook()` | Update to FAILED |
| `order.paid` | `handleOrderPaid()` | Update metadata |

## Setup Checklist

- [ ] Add `RAZORPAY_WEBHOOK_SECRET` to `.env`
- [ ] Configure webhook in Razorpay Dashboard
- [ ] Enable raw body middleware in `main.ts`
- [ ] Test with ngrok locally
- [ ] Deploy and update webhook URL
- [ ] Monitor webhook deliveries

## Environment Variables

```bash
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxx
```

## Razorpay Dashboard

**URL:** https://dashboard.razorpay.com/app/webhooks

**Webhook URL:**
- Local: `https://xxxx.ngrok.io/payments/webhook`
- Production: `https://api.your-domain.com/payments/webhook`

**Events to Subscribe:**
- ✅ payment.authorized
- ✅ payment.captured
- ✅ payment.failed
- ✅ order.paid

## Testing

### Test from Dashboard
1. Go to Webhooks → Your Webhook
2. Click "Send Test Webhook"
3. Select event type
4. Verify 200 OK

### Test with curl
```bash
curl -X POST http://localhost:3000/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-razorpay-signature: <signature>" \
  -d @webhook-payload.json
```

## Monitoring

### Logs to Watch
```
[PaymentController] Webhook received: payment.captured
[PaymentService] Payment captured: pay_xxx
[PaymentService] Order completed: ORD-xxx
```

### Razorpay Dashboard
- Delivery status
- Response codes
- Retry attempts

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Webhook not received | Check URL, HTTPS, firewall |
| Invalid signature | Check webhook secret, raw body |
| Payment not updated | Check logs, verify payment exists |
| 401 Unauthorized | Verify signature, check secret |

## Security

- ✅ Signature verification
- ✅ HTTPS only (production)
- ✅ Public endpoint but protected
- ✅ Idempotency implemented

## Code Snippets

### Verify Signature
```typescript
const isValid = await this.razorpayService.verifyWebhookSignature(
  rawBody,
  signature,
);
```

### Handle Event
```typescript
switch (payload.event) {
  case RazorpayWebhookEvent.PAYMENT_CAPTURED:
    await this.paymentService.handlePaymentCaptured(
      payload.payload.payment.entity,
    );
    break;
}
```

### Check Idempotency
```typescript
if (payment.status === PaymentStatus.CAPTURED) {
  return; // Already processed
}
```

## Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 401 | Invalid signature |
| 500 | Processing error (still return 200) |

## Razorpay IPs (Optional Whitelist)

```
52.66.193.64
52.66.193.65
52.66.193.66
```

## Support

- Docs: https://razorpay.com/docs/webhooks/
- Dashboard: https://dashboard.razorpay.com/
- Support: support@razorpay.com

## Quick Commands

### Start with ngrok
```bash
npm run start:dev
ngrok http 3000
```

### Check logs
```bash
# Development
npm run start:dev

# Production
pm2 logs your-app
```

### Test webhook
```bash
curl -X POST http://localhost:3000/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"payment.captured"}'
```

---

**Version:** 1.0.0  
**Last Updated:** May 2, 2026
