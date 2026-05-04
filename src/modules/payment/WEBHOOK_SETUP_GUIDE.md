# Razorpay Webhook Setup Guide

## Quick Start

Follow these steps to set up Razorpay webhooks for your application.

## Prerequisites

- ✅ Razorpay account (test or live)
- ✅ Backend server deployed and accessible
- ✅ HTTPS enabled (required for production)

## Step 1: Update Environment Variables

Add the following to your `.env` file:

```bash
# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```

**Where to find these:**
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: [API Keys](https://dashboard.razorpay.com/app/keys)
- `RAZORPAY_WEBHOOK_SECRET`: Generated in Step 3

## Step 2: Enable Raw Body Middleware

Update `src/main.ts` to enable raw body for webhook signature verification:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable raw body for webhook endpoint
  app.use(
    '/payments/webhook',
    express.json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Other middleware...
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  await app.listen(3000);
}
bootstrap();
```

## Step 3: Configure Webhook in Razorpay Dashboard

### 3.1 Access Webhook Settings

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Navigate to **Settings** → **Webhooks**
3. Click **"Add New Webhook"**

### 3.2 Configure Webhook

**Webhook URL:**
```
https://your-domain.com/payments/webhook
```

For local development with ngrok:
```
https://xxxx.ngrok.io/payments/webhook
```

**Active Events:** Select the following events:
- ✅ `payment.authorized`
- ✅ `payment.captured`
- ✅ `payment.failed`
- ✅ `order.paid`

**Optional Events (for future use):**
- ⬜ `refund.created`
- ⬜ `refund.processed`
- ⬜ `refund.failed`

**Alert Email:**
Enter your email to receive alerts for webhook failures.

### 3.3 Generate Webhook Secret

1. After creating the webhook, Razorpay will generate a **Webhook Secret**
2. Copy this secret
3. Add it to your `.env` file as `RAZORPAY_WEBHOOK_SECRET`

### 3.4 Save Configuration

Click **"Create Webhook"** to save.

## Step 4: Verify Webhook Endpoint

### 4.1 Check Endpoint is Accessible

```bash
curl -X POST https://your-domain.com/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

Expected response:
```json
{
  "status": "ok"
}
```

### 4.2 Test Webhook from Razorpay Dashboard

1. Go to **Settings** → **Webhooks**
2. Click on your webhook
3. Click **"Send Test Webhook"**
4. Select event: `payment.captured`
5. Click **"Send"**
6. Check response status (should be 200 OK)

## Step 5: Local Development Setup

### 5.1 Install ngrok

```bash
npm install -g ngrok
```

### 5.2 Start Your Server

```bash
npm run start:dev
```

### 5.3 Expose Local Server

```bash
ngrok http 3000
```

Output:
```
Forwarding  https://xxxx.ngrok.io -> http://localhost:3000
```

### 5.4 Update Webhook URL

1. Copy the ngrok HTTPS URL
2. Go to Razorpay Dashboard → Webhooks
3. Edit your webhook
4. Update URL to: `https://xxxx.ngrok.io/payments/webhook`
5. Save

### 5.5 Test Locally

1. Make a test payment
2. Check your server logs for webhook events
3. Verify payment status is updated

## Step 6: Production Deployment

### 6.1 Deploy Backend

Deploy your backend to a production server with HTTPS enabled.

### 6.2 Update Webhook URL

1. Go to Razorpay Dashboard → Webhooks
2. Edit your webhook
3. Update URL to production: `https://api.your-domain.com/payments/webhook`
4. Save

### 6.3 Switch to Live Mode

1. Go to Razorpay Dashboard
2. Switch from **Test Mode** to **Live Mode**
3. Create a new webhook for live mode
4. Update environment variables with live keys

## Step 7: Verify Setup

### 7.1 Check Logs

Monitor your server logs for webhook events:

```bash
# Development
npm run start:dev

# Production
pm2 logs your-app
```

Expected logs:
```
[PaymentController] Webhook received: payment.captured
[PaymentService] Payment captured: pay_xxx
[PaymentService] Order completed: ORD-xxx
```

### 7.2 Test Payment Flow

1. Create a test order
2. Complete payment
3. Check webhook is received
4. Verify order status is updated
5. Verify stock is converted

### 7.3 Check Razorpay Dashboard

1. Go to **Settings** → **Webhooks**
2. Click on your webhook
3. Check **"Recent Deliveries"**
4. Verify all webhooks are delivered successfully (200 OK)

## Troubleshooting

### Webhook Not Received

**Problem:** Webhook is not reaching your server

**Solutions:**
1. ✅ Verify URL is correct in Razorpay Dashboard
2. ✅ Check server is running and accessible
3. ✅ Verify HTTPS is enabled (production)
4. ✅ Check firewall allows Razorpay IPs
5. ✅ Verify endpoint is public (`@Public()` decorator)

### Invalid Signature Error

**Problem:** Webhook signature verification fails

**Solutions:**
1. ✅ Verify `RAZORPAY_WEBHOOK_SECRET` is correct
2. ✅ Check raw body middleware is configured
3. ✅ Ensure body is not parsed before verification
4. ✅ Verify secret matches Razorpay Dashboard

### Payment Not Updated

**Problem:** Webhook received but payment not updated

**Solutions:**
1. ✅ Check server logs for errors
2. ✅ Verify payment exists in database
3. ✅ Check `razorpayOrderId` matches
4. ✅ Verify transaction is committed
5. ✅ Check for duplicate processing

### Webhook Delivery Failed

**Problem:** Razorpay shows webhook delivery failed

**Solutions:**
1. ✅ Check server returned 200 OK
2. ✅ Verify endpoint is accessible
3. ✅ Check server logs for errors
4. ✅ Increase timeout if processing is slow
5. ✅ Return 200 quickly, process async if needed

## Security Checklist

- ✅ Webhook secret is stored securely in environment variables
- ✅ Signature verification is implemented
- ✅ Endpoint is public but signature-protected
- ✅ HTTPS is enabled in production
- ✅ Raw body is used for signature verification
- ✅ Idempotency is implemented
- ✅ Error handling is in place
- ✅ Logging is enabled

## Monitoring Checklist

- ✅ Webhook delivery status is monitored
- ✅ Alerts are set up for failures
- ✅ Logs are reviewed regularly
- ✅ Response times are tracked
- ✅ Error rates are monitored

## Testing Checklist

- ✅ Test webhook with Razorpay test mode
- ✅ Test signature verification
- ✅ Test payment.captured event
- ✅ Test payment.failed event
- ✅ Test payment.authorized event
- ✅ Test order.paid event
- ✅ Test duplicate webhooks (idempotency)
- ✅ Test invalid signature
- ✅ Test payment not found
- ✅ Test processing errors

## Configuration Examples

### Development (.env.development)

```bash
NODE_ENV=development
PORT=3000

# Razorpay Test Mode
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# Database
DATABASE_URL=postgresql://localhost:5432/ecommerce_dev
```

### Production (.env.production)

```bash
NODE_ENV=production
PORT=3000

# Razorpay Live Mode
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# Database
DATABASE_URL=postgresql://prod-db:5432/ecommerce_prod
```

## Webhook URL Examples

### Local Development
```
http://localhost:3000/payments/webhook  (won't work with Razorpay)
https://xxxx.ngrok.io/payments/webhook  (use this)
```

### Staging
```
https://staging-api.your-domain.com/payments/webhook
```

### Production
```
https://api.your-domain.com/payments/webhook
```

## Razorpay IP Whitelist (Optional)

If you want to restrict webhook access to Razorpay IPs only:

```
52.66.193.64
52.66.193.65
52.66.193.66
```

Add to your firewall or implement in code:

```typescript
const RAZORPAY_IPS = [
  '52.66.193.64',
  '52.66.193.65',
  '52.66.193.66',
];

@Post('webhook')
async handleWebhook(@Req() req: Request) {
  const clientIp = req.ip;
  
  if (!RAZORPAY_IPS.includes(clientIp)) {
    throw new UnauthorizedException('Invalid IP');
  }
  
  // Process webhook...
}
```

## Support

### Razorpay Support
- Dashboard: https://dashboard.razorpay.com/
- Docs: https://razorpay.com/docs/webhooks/
- Support: support@razorpay.com

### Common Issues
- [Webhook Signature Verification](https://razorpay.com/docs/webhooks/validate-test/)
- [Webhook Events](https://razorpay.com/docs/webhooks/events/)
- [Webhook Troubleshooting](https://razorpay.com/docs/webhooks/troubleshooting/)

## Next Steps

After setting up webhooks:

1. ✅ Test thoroughly in test mode
2. ✅ Monitor webhook deliveries
3. ✅ Set up alerts for failures
4. ✅ Document any custom configurations
5. ✅ Train team on webhook monitoring
6. ✅ Plan for webhook queue (if needed)
7. ✅ Implement refund webhooks (future)

---

**Last Updated:** May 2, 2026  
**Version:** 1.0.0
