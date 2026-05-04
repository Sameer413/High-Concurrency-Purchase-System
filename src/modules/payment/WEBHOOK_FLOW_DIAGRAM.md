# Webhook Flow Diagrams

## Complete Payment Flow with Webhooks

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Complete Payment Flow with Webhooks                       │
└─────────────────────────────────────────────────────────────────────────────┘

User          Frontend         Backend          Database        Razorpay
 │                │                │                │                │
 │ 1. Checkout    │                │                │                │
 ├───────────────>│                │                │                │
 │                │ 2. Create      │                │                │
 │                │    Payment     │                │                │
 │                ├───────────────>│                │                │
 │                │                │ 3. Create      │                │
 │                │                │    Order       │                │
 │                │                ├───────────────>│                │
 │                │                │                │ 4. Create      │
 │                │                │                │    Razorpay    │
 │                │                │                │    Order       │
 │                │                ├───────────────────────────────>│
 │                │                │                │                │
 │                │                │ 5. Save        │                │
 │                │                │    Payment     │                │
 │                │                ├───────────────>│                │
 │                │                │                │                │
 │                │ 6. Payment     │                │                │
 │                │    Details     │                │                │
 │                │<───────────────┤                │                │
 │                │                │                │                │
 │ 7. Show        │                │                │                │
 │    Razorpay    │                │                │                │
 │    Modal       │                │                │                │
 │<───────────────┤                │                │                │
 │                │                │                │                │
 │ 8. Enter       │                │                │                │
 │    Payment     │                │                │                │
 │    Details     │                │                │                │
 ├───────────────────────────────────────────────────────────────────>│
 │                │                │                │                │
 │ 9. Payment     │                │                │                │
 │    Success     │                │                │                │
 │<───────────────────────────────────────────────────────────────────┤
 │                │                │                │                │
 │                │ 10. Verify     │                │                │
 │                │     Payment    │                │                │
 │                ├───────────────>│                │                │
 │                │                │ 11. Verify     │                │
 │                │                │     Signature  │                │
 │                │                ├───────────────────────────────>│
 │                │                │                │                │
 │                │                │ 12. Update     │                │
 │                │                │     Payment    │                │
 │                │                ├───────────────>│                │
 │                │                │                │                │
 │                │                │ 13. Complete   │                │
 │                │                │     Order      │                │
 │                │                ├───────────────>│                │
 │                │                │                │                │
 │                │ 14. Success    │                │                │
 │                │<───────────────┤                │                │
 │                │                │                │                │
 │ 15. Show       │                │                │                │
 │     Success    │                │                │                │
 │<───────────────┤                │                │                │
 │                │                │                │                │
 │                │                │ 16. WEBHOOK:   │                │
 │                │                │     payment.   │                │
 │                │                │     captured   │                │
 │                │                │<───────────────────────────────┤
 │                │                │                │                │
 │                │                │ 17. Verify     │                │
 │                │                │     Signature  │                │
 │                │                │                │                │
 │                │                │ 18. Check      │                │
 │                │                │     Already    │                │
 │                │                │     Processed  │                │
 │                │                ├───────────────>│                │
 │                │                │                │                │
 │                │                │ 19. Already    │                │
 │                │                │     Completed  │                │
 │                │                │     (Skip)     │                │
 │                │                │                │                │
 │                │                │ 20. ACK        │                │
 │                │                ├───────────────────────────────>│
 │                │                │                │                │
```

## Webhook Processing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Webhook Processing Flow                              │
└─────────────────────────────────────────────────────────────────────────────┘

Razorpay                    Backend                         Database
   │                           │                                │
   │ 1. Send Webhook           │                                │
   │   POST /payments/webhook  │                                │
   ├──────────────────────────>│                                │
   │   Headers:                │                                │
   │   x-razorpay-signature    │                                │
   │                           │                                │
   │                           │ 2. Extract Raw Body            │
   │                           │    & Signature                 │
   │                           │                                │
   │                           │ 3. Verify Signature            │
   │                           │    HMAC SHA256                 │
   │                           │                                │
   │                           ├─ Valid? ──┐                    │
   │                           │           │                    │
   │                           │    Yes    │    No              │
   │                           │           │                    │
   │                           │           └──> Return 401      │
   │                           │                Unauthorized    │
   │                           │                                │
   │                           │ 4. Parse Event                 │
   │                           │    payload.event               │
   │                           │                                │
   │                           │ 5. Route to Handler            │
   │                           │                                │
   │                           ├─ payment.captured ──┐          │
   │                           │                     │          │
   │                           │                     ▼          │
   │                           │         handlePaymentCaptured()│
   │                           │                     │          │
   │                           │                     │          │
   │                           │         6. Find Payment        │
   │                           │            by razorpayOrderId  │
   │                           ├────────────────────────────────>│
   │                           │                                │
   │                           │         7. Payment Found       │
   │                           │<────────────────────────────────┤
   │                           │                                │
   │                           │         8. Check Status        │
   │                           │            Already CAPTURED?   │
   │                           │                                │
   │                           ├─ Yes ──> Skip (Idempotent)     │
   │                           │                                │
   │                           │         9. Start Transaction   │
   │                           │                                │
   │                           │        10. Update Payment      │
   │                           │            status = CAPTURED   │
   │                           ├────────────────────────────────>│
   │                           │                                │
   │                           │        11. Update Order        │
   │                           │            status = PAID       │
   │                           ├────────────────────────────────>│
   │                           │                                │
   │                           │        12. Convert Stock       │
   │                           │            Reserved → Sold     │
   │                           ├────────────────────────────────>│
   │                           │                                │
   │                           │        13. Complete            │
   │                           │            Reservation         │
   │                           ├────────────────────────────────>│
   │                           │                                │
   │                           │        14. Commit Transaction  │
   │                           │<────────────────────────────────┤
   │                           │                                │
   │                           │        15. Log Success         │
   │                           │                                │
   │ 16. Return 200 OK         │                                │
   │<──────────────────────────┤                                │
   │   { status: "ok" }        │                                │
   │                           │                                │
```

## Event Routing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Event Routing                                     │
└─────────────────────────────────────────────────────────────────────────────┘

Webhook Event
     │
     ▼
┌─────────────────┐
│ Event Router    │
└────────┬────────┘
         │
         ├─ payment.authorized ──────> handlePaymentAuthorized()
         │                              │
         │                              ├─> Update status: PENDING
         │                              ├─> Store razorpayPaymentId
         │                              ├─> Store method
         │                              └─> Log event
         │
         ├─ payment.captured ───────────> handlePaymentCaptured()
         │                              │
         │                              ├─> Check idempotency
         │                              ├─> Update status: CAPTURED
         │                              ├─> Complete order: PAID
         │                              ├─> Convert stock: Reserved → Sold
         │                              ├─> Complete reservation
         │                              └─> Log success
         │
         ├─ payment.failed ─────────────> handlePaymentFailedWebhook()
         │                              │
         │                              ├─> Update status: FAILED
         │                              ├─> Store error details
         │                              └─> Log failure
         │
         ├─ order.paid ─────────────────> handleOrderPaid()
         │                              │
         │                              ├─> Update metadata
         │                              └─> Log event
         │
         └─ refund.* ───────────────────> (Future Implementation)
                                        │
                                        └─> Log event
```

## Signature Verification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Signature Verification                                │
└─────────────────────────────────────────────────────────────────────────────┘

Webhook Request
     │
     ├─ Headers: x-razorpay-signature
     └─ Body: Raw JSON
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Extract Raw Body                                                 │
│ const rawBody = req.rawBody.toString('utf-8')                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Extract Signature                                                │
│ const signature = req.headers['x-razorpay-signature']          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Compute Expected Signature                                       │
│ const expected = crypto                                          │
│   .createHmac('sha256', WEBHOOK_SECRET)                         │
│   .update(rawBody)                                              │
│   .digest('hex')                                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Compare Signatures                                               │
│ expected === signature                                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                  Valid            Invalid
                    │                 │
                    ▼                 ▼
         ┌──────────────────┐  ┌──────────────────┐
         │ Process Webhook  │  │ Return 401       │
         │                  │  │ Unauthorized     │
         └──────────────────┘  └──────────────────┘
```

## Idempotency Check

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Idempotency Check                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Webhook Event: payment.captured
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Find Payment by razorpayOrderId                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Check Current Status                                             │
│ payment.status === ?                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
              CAPTURED            Other Status
                    │                 │
                    ▼                 ▼
         ┌──────────────────┐  ┌──────────────────┐
         │ Already Processed│  │ Process Webhook  │
         │ Skip & Return    │  │ Update Status    │
         │ 200 OK           │  │ Complete Order   │
         └──────────────────┘  └──────────────────┘
                    │                 │
                    └────────┬────────┘
                             │
                             ▼
                  ┌──────────────────┐
                  │ Return 200 OK    │
                  │ { status: "ok" } │
                  └──────────────────┘
```

## Transaction Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Transaction Flow                                    │
└─────────────────────────────────────────────────────────────────────────────┘

handlePaymentCaptured()
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Start Database Transaction                                       │
│ await this.dataSource.transaction(async (manager) => {          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Find Payment (with relations)                                │
│    - payment                                                     │
│    - order                                                       │
│    - order.items                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Check Idempotency                                             │
│    if (payment.status === CAPTURED) return;                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Update Payment                                                │
│    - status = CAPTURED                                           │
│    - razorpayPaymentId                                          │
│    - method                                                      │
│    - metadata                                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Update Order                                                  │
│    - status = PAID                                               │
│    - paidAt = now()                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Convert Stock (for each item)                                │
│    - Reserved → Sold                                             │
│    - inventoryService.confirmSaleTx()                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Complete Reservation                                          │
│    - status = COMPLETED                                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Commit Transaction                                               │
│ });                                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                  ┌──────────────────┐
                  │ Success          │
                  │ All or Nothing   │
                  └──────────────────┘
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Error Handling Flow                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Webhook Processing
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ try {                                                            │
│   // Process webhook                                             │
│ } catch (error) {                                               │
│   // Handle error                                               │
│ }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
              Success             Error
                    │                 │
                    ▼                 ▼
         ┌──────────────────┐  ┌──────────────────┐
         │ Return 200 OK    │  │ Check Error Type │
         │ { status: "ok" } │  └────────┬─────────┘
         └──────────────────┘           │
                                        │
                           ┌────────────┴────────────┐
                           │                         │
                  UnauthorizedException      Other Errors
                           │                         │
                           ▼                         ▼
                ┌──────────────────┐      ┌──────────────────┐
                │ Return 401       │      │ Log Error        │
                │ Invalid Signature│      │ Return 200 OK    │
                │                  │      │ (Prevent Retry)  │
                └──────────────────┘      └──────────────────┘
```

---

**Version:** 1.0.0  
**Last Updated:** May 2, 2026
