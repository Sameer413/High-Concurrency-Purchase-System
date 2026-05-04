# Idempotency Quick Reference

## Header Format

```
Idempotency-Key: idem_{userId}_{orderId}_{timestamp}_{random}
```

## Frontend Usage

### Generate Key
```typescript
import { generateIdempotencyKey } from '@/lib/idempotency';

const key = generateIdempotencyKey(userId, orderId);
// Returns: idem_user123_order456_1234567890_abc123
```

### Store for Retry
```typescript
import { IdempotencyKeyManager } from '@/lib/idempotency';

// Store
IdempotencyKeyManager.store('payment_order123', key);

// Retrieve
const storedKey = IdempotencyKeyManager.retrieve('payment_order123');

// Remove
IdempotencyKeyManager.remove('payment_order123');
```

### API Call
```typescript
const [createPayment] = useCreatePaymentMutation();

await createPayment({
  orderId: 'order-123',
  amount: 10000,
  currency: 'INR',
  userId: currentUser.id,
});
// Idempotency key is automatically added!
```

## Backend Usage

### Controller
```typescript
@Post('create')
async createPayment(
  @Body() dto: CreatePaymentDto,
  @CurrentUser() user: User,
  @Headers('idempotency-key') idempotencyKey?: string,
) {
  return await this.paymentService.createPayment(dto, user.id, idempotencyKey);
}
```

### Service
```typescript
async createPayment(dto, userId, idempotencyKey?) {
  // Check idempotency key
  if (idempotencyKey) {
    const existing = await this.paymentRepo.findOne({
      where: { idempotencyKey },
    });
    
    if (existing) {
      return { ...existing, idempotent: true };
    }
  }
  
  // Create new payment
  const payment = await this.paymentRepo.save({
    ...dto,
    idempotencyKey,
  });
  
  return { ...payment, idempotent: false };
}
```

## Response Format

```json
{
  "success": true,
  "data": {
    "paymentId": "pay-123",
    "razorpayOrderId": "order_xxx",
    "amount": 10000,
    "currency": "INR",
    "idempotent": false  // false = new, true = cached
  }
}
```

## Testing

### Test Duplicate Request
```bash
# Request 1
curl -X POST http://localhost:3000/payments/create \
  -H "Idempotency-Key: idem_test_123" \
  -H "Authorization: Bearer <token>" \
  -d '{"orderId":"order-123","amount":10000,"currency":"INR"}'

# Request 2 (same key)
curl -X POST http://localhost:3000/payments/create \
  -H "Idempotency-Key: idem_test_123" \
  -H "Authorization: Bearer <token>" \
  -d '{"orderId":"order-123","amount":10000,"currency":"INR"}'

# Same payment returned!
```

## Database

### Schema
```sql
ALTER TABLE payments 
ADD COLUMN idempotencyKey VARCHAR(255) NULL;

CREATE UNIQUE INDEX idx_payments_idempotency_key 
ON payments (idempotencyKey) 
WHERE idempotencyKey IS NOT NULL;
```

### Query
```sql
-- Find by idempotency key
SELECT * FROM payments WHERE idempotencyKey = 'idem_test_123';

-- Check duplicates
SELECT idempotencyKey, COUNT(*) 
FROM payments 
WHERE idempotencyKey IS NOT NULL 
GROUP BY idempotencyKey 
HAVING COUNT(*) > 1;
```

## Validation

### Frontend
```typescript
import { isValidIdempotencyKey } from '@/lib/idempotency';

if (!isValidIdempotencyKey(key)) {
  throw new Error('Invalid idempotency key format');
}
```

### Backend
```typescript
if (idempotencyKey && !isValidIdempotencyKey(idempotencyKey)) {
  throw new BadRequestException('Invalid idempotency key format');
}

function isValidIdempotencyKey(key: string): boolean {
  return /^idem_[a-zA-Z0-9_-]{1,240}$/.test(key);
}
```

## Monitoring

### Logs
```
[PaymentService] Idempotent request: idem_test_123, returning: pay-1
[PaymentService] Payment created: pay-2 with key: idem_test_456
```

### Metrics
```typescript
// Track idempotent requests
const idempotentRate = idempotentRequests / totalRequests;

// Track key reuse
const keyReuseCount = await countByIdempotencyKey(key);
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Duplicate payments | Always send idempotency key |
| Key already used error | Generate new key for new attempt |
| Cached response stale | Check payment status |
| Key not working | Verify format and uniqueness |

## Best Practices

- ✅ Always use idempotency keys for payments
- ✅ Store keys for retry scenarios
- ✅ Check `idempotent` flag in response
- ✅ Validate key format
- ✅ Monitor idempotent requests

## Key Format Rules

- Max length: 255 characters
- Prefix: `idem_`
- Characters: alphanumeric, underscore, hyphen
- Unique per payment attempt
- Deterministic for retries

---

**Version:** 1.0.0  
**Last Updated:** May 2, 2026
