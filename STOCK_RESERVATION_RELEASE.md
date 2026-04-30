# Stock Reservation & Release Flow

## 🎯 **Problem Statement**

When a user clicks "Buy Now", stock is reserved. But what happens if they:
- Abandon checkout?
- Cancel the order?
- Payment fails?

**Answer**: The reserved stock must be released back to available stock.

---

## 🔄 **Complete Stock Lifecycle**

```
┌─────────────────────────────────────────────────────────────────┐
│                    STOCK LIFECYCLE                              │
└─────────────────────────────────────────────────────────────────┘

1. INITIAL STATE
   Product.stock = 500
   Inventory.totalStock = 500
   Inventory.reservedStock = 0
   Inventory.availableStock = 500

2. USER CLICKS "BUY NOW"
   ├─ Stock Reserved: reservedStock + 25
   ├─ Available: 500 → 475
   ├─ Redis: reservation:productId = "Pending" (10 min TTL)
   └─ Navigate to checkout

3. USER COMPLETES CHECKOUT
   ├─ Payment processed
   ├─ Stock Confirmed: reservedStock → soldStock
   ├─ Total Stock: 500 → 475
   ├─ Redis: reservation key deleted
   └─ Navigate to success page

4. USER ABANDONS CHECKOUT
   ├─ Wait 10 minutes (Redis TTL)
   ├─ Cleanup job runs (every 5 min)
   ├─ Stock Released: reservedStock - 25
   ├─ Available: 475 → 500
   └─ Redis: reservation key deleted

5. USER CANCELS CHECKOUT
   ├─ Manual release called
   ├─ Stock Released: reservedStock - 25
   ├─ Available: 475 → 500
   └─ Navigate back to product
```

---

## 🛠️ **Implementation Details**

### **1. Stock Reservation (When User Clicks "Buy Now")**

```typescript
// ProductController.buy()
@Post(':id/buy')
async buy(
  @Param('id') id: string,
  @Body('quantity') quantity: number,
  @CurrentUser('id') userId: string,
) {
  const result = await this.productService.buy(userId, id, quantity);
  
  if (result.success) {
    // Navigate to checkout
    router.push(`/checkout?buyNow=true&product=${productData}`);
  }
}

// ProductService.buy()
async buy(userId: string, id: string, quantity: number) {
  return this.dataSource.transaction(async (manager) => {
    // 1. Validate product
    const product = await productRepo.findOne({ where: { id } });
    
    // 2. Reserve stock atomically
    const inventory = await this.inventoryService.reserveStockTx(
      manager,
      id,
      quantity,
    );
    
    // 3. Set Redis reservation with 10 min TTL
    await this.redisService.set(
      `reservation:${id}`,
      'Pending',
      10 * 60, // 10 minutes
    );
    
    return { success: true, availableStock: inventory.availableStock };
  });
}
```

### **2. Stock Release (When User Abandons Checkout)**

#### **Option A: Automatic Release (Recommended)**

```typescript
// CleanupService.releaseExpiredReservations()
async releaseExpiredReservations() {
  // Get all reservation keys from Redis
  const reservationKeys = await this.redisService.keys('reservation:*');
  
  for (const key of reservationKeys) {
    const status = await this.redisService.get(key);
    
    if (status === 'Pending') {
      const ttl = await this.redisService.ttl(key);
      
      if (ttl <= 0) {
        // Key expired, release stock
        const productId = key.replace('reservation:', '');
        await this.releaseStockForProduct(productId);
        await this.redisService.del(key);
      }
    }
  }
}

// Run every 5 minutes
@Cron(CronExpression.EVERY_5_MINUTES)
async handleCleanup() {
  await this.cleanupService.releaseExpiredReservations();
}
```

#### **Option B: Manual Release (When User Cancels)**

```typescript
// In CheckoutPage.tsx
const handleCancelCheckout = async () => {
  // Release all reserved stock
  for (const item of cart) {
    await inventoryService.releaseReservation(
      item.productId,
      item.quantity
    );
  }
  
  // Clear cart
  localStorage.removeItem('cart');
  router.push('/products');
};
```

### **3. Stock Release (When Payment Fails)**

```typescript
// In CheckoutForm.tsx
const handlePaymentFailure = async () => {
  // Release the reserved stock
  await inventoryService.releaseReservation(
    productId,
    quantity
  );
  
  // Show error
  setError('Payment failed. Stock has been released.');
};
```

---

## 📊 **Redis Key Structure**

```
Key: reservation:{productId}
Value: "Pending"
TTL: 600 seconds (10 minutes)

Example:
reservation:123e4567-e89b-12d3-a456-426614174000 = "Pending" (expires in 10 min)
```

---

## 🔄 **Automatic Cleanup Flow**

```
┌─────────────────────────────────────────────────────────────────┐
│              CLEANUP JOB (Runs Every 5 Minutes)                 │
└─────────────────────────────────────────────────────────────────┘

1. Get all reservation keys from Redis
   reservation:product1
   reservation:product2
   reservation:product3

2. For each key:
   ├─ Check status = "Pending"
   ├─ Check TTL (time to live)
   │
   ├─ If TTL <= 0 (expired):
   │  ├─ Extract productId
   │  ├─ Release stock in database
   │  │  UPDATE inventory
   │  │  SET reservedStock = 0
   │  │  WHERE productId = 'xxx'
   │  │
   │  ├─ Update Product.stock
   │  │  UPDATE products
   │  │  SET stock = (SELECT totalStock FROM inventory...)
   │  │
   │  └─ Delete Redis key
   │
   └─ If TTL > 0 (not expired):
      └─ Skip (keep reservation)

3. Log results
   "Released: 2, Not expired: 1"
```

---

## 🎯 **Stock Release Scenarios**

### **Scenario 1: Successful Purchase**
```
User Action: Complete checkout + Payment
Result: Stock moved from reserved to sold
Redis: Key deleted immediately
```

### **Scenario 2: Abandoned Checkout**
```
User Action: Close browser / Navigate away
Result: Stock released after 10 minutes (Redis TTL)
Cleanup Job: Runs every 5 minutes, releases expired reservations
```

### **Scenario 3: Cancel Checkout**
```
User Action: Click "Cancel" button
Result: Stock released immediately
Redis: Key deleted immediately
```

### **Scenario 4: Payment Failed**
```
User Action: Payment processing failed
Result: Stock released immediately
Redis: Key deleted immediately
```

### **Scenario 5: Order Cancelled (Admin)**
```
User Action: Admin cancels order
Result: Stock released immediately
Redis: Key deleted immediately
```

---

## 📈 **Database Updates**

### **When Stock is Reserved**
```sql
UPDATE inventory
SET "reservedStock" = "reservedStock" + 25,
    "updatedAt" = NOW()
WHERE "productId" = 'xxx'
AND ("totalStock" - "reservedStock") >= 25
RETURNING "totalStock", "reservedStock"
```

### **When Stock is Released**
```sql
UPDATE inventory
SET "reservedStock" = GREATEST(0, "reservedStock" - 25),
    "updatedAt" = NOW()
WHERE "productId" = 'xxx'
```

### **When Stock is Confirmed (Sale)**
```sql
UPDATE inventory
SET "reservedStock" = "reservedStock" - 25,
    "totalStock" = "totalStock" - 25,
    "soldStock" = "soldStock" + 25,
    "updatedAt" = NOW()
WHERE "productId" = 'xxx'
AND "reservedStock" >= 25
```

---

## ⚙️ **Configuration**

### **Cron Schedule**
```typescript
// Run every 5 minutes
@Cron(CronExpression.EVERY_5_MINUTES)

// Or customize
@Cron('0 */5 * * * *') // Every 5 minutes
```

### **Reservation TTL**
```typescript
// 10 minutes reservation time
await this.redisService.set(
  `reservation:${id}`,
  'Pending',
  10 * 60, // 600 seconds
);
```

---

## 🧪 **Testing the Flow**

### **Test 1: Successful Purchase**
```bash
1. Click "Buy Now" → Stock reserved
2. Complete checkout → Stock confirmed
3. Check inventory → reservedStock = 0, soldStock = 5
```

### **Test 2: Abandoned Checkout**
```bash
1. Click "Buy Now" → Stock reserved
2. Wait 10 minutes
3. Check inventory → reservedStock = 0 (released)
```

### **Test 3: Cancel Checkout**
```bash
1. Click "Buy Now" → Stock reserved
2. Click "Cancel" → Stock released immediately
3. Check inventory → reservedStock = 0
```

---

## 📋 **Summary**

| Action | Stock Release | Redis Key | Timing |
|--------|---------------|-----------|--------|
| Successful Purchase | ✅ Confirmed | Deleted | Immediate |
| Abandoned Checkout | ✅ Released | Auto-deleted | After 10 min TTL |
| Cancel Checkout | ✅ Released | Deleted | Immediate |
| Payment Failed | ✅ Released | Deleted | Immediate |
| Admin Cancel | ✅ Released | Deleted | Immediate |

### **Key Points**
- ✅ **Automatic cleanup** handles abandoned checkouts
- ✅ **Manual release** handles cancellations
- ✅ **Redis TTL** ensures cleanup even if user closes browser
- ✅ **Cleanup job** runs every 5 minutes to clean up expired reservations
- ✅ **Both Product.stock and Inventory.reservedStock** are updated

---

**Your stock reservation system is now complete with automatic release!** 🎉
