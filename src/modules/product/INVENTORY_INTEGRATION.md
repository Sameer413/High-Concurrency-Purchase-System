# Product Service - Inventory Integration

## Overview

The ProductService now integrates with InventoryService to provide **accurate stock availability** that accounts for reserved stock (items in carts/checkout).

## What Changed

### Before (Using Product.stock only)
```typescript
async getProductAvailability(id: string) {
  const product = await this.productRepo.findOne({ where: { id } });
  return {
    availableStock: product.stock, // ❌ Doesn't account for reserved stock
    canBuy: product.stock > 0,
  };
}
```

**Problem**: If 100 items are in stock but 25 are reserved in carts, it would show 100 available instead of 75.

### After (Using Inventory)
```typescript
async getProductAvailability(id: string) {
  const inventory = await this.inventoryService.getByProductId(id);
  return {
    availableStock: inventory.availableStock, // ✅ totalStock - reservedStock
    canBuy: inventory.availableStock > 0,
  };
}
```

**Solution**: Now correctly shows 75 available (100 total - 25 reserved).

## Updated Methods

### 1. getProductAvailability()

**Purpose**: Check how much stock is actually available for purchase.

**Flow**:
```
1. Check Redis cache
   ├─ If cached → return cached data
   └─ If not cached → continue

2. Check if product is active
   ├─ If inactive → return { availableStock: 0, canBuy: false }
   └─ If active → continue

3. Get inventory data
   ├─ Calculate: availableStock = totalStock - reservedStock
   ├─ Determine: canBuy = availableStock > 0
   └─ Cache result for 30 seconds

4. Return { availableStock, canBuy }
```

**Example**:
```typescript
const availability = await productService.getProductAvailability(productId);

// Result:
{
  availableStock: 475,  // 500 total - 25 reserved
  canBuy: true
}
```

### 2. buy()

**Purpose**: Reserve stock when a customer adds to cart or starts checkout.

**Flow**:
```
1. Check if product is active
   ├─ If inactive → return { success: false, availableStock: 0 }
   └─ If active → continue

2. Check availability
   ├─ If insufficient → return { success: false, availableStock: X }
   └─ If sufficient → continue

3. Reserve stock
   ├─ Inventory.reservedStock += quantity
   └─ Invalidate cache

4. Return { success: true, availableStock: X }
```

**Example**:
```typescript
// Customer adds 5 items to cart
const result = await productService.buy(productId, 5);

if (result.success) {
  // Stock reserved successfully
  // Inventory.reservedStock increased by 5
} else {
  // Not enough stock
  console.log(`Only ${result.availableStock} available`);
}
```

## Stock States Comparison

### Scenario: Product with 500 total stock, 25 reserved

| Method | Old Behavior | New Behavior |
|--------|-------------|--------------|
| `getProductAvailability()` | Returns 500 ❌ | Returns 475 ✅ |
| `buy(5)` | Always succeeds ❌ | Checks actual availability ✅ |
| Cache | Caches total stock | Caches available stock ✅ |

## Integration Benefits

### 1. Accurate Availability
```typescript
// Real-time accurate stock considering reservations
const { availableStock } = await productService.getProductAvailability(id);
// availableStock = totalStock - reservedStock ✅
```

### 2. Prevents Overselling
```typescript
// If 475 available and customer tries to buy 500
const result = await productService.buy(id, 500);
// result.success = false ✅
// result.availableStock = 475
```

### 3. Proper Reservation
```typescript
// Reserves stock in inventory
await productService.buy(id, 5);
// Inventory.reservedStock += 5 ✅
// Other customers see reduced availability ✅
```

### 4. Cache Invalidation
```typescript
// When stock is reserved, cache is cleared
await productService.buy(id, 5);
// Cache invalidated ✅
// Next call gets fresh data ✅
```

## Usage in Controllers

### Product Controller
```typescript
@Get(':id/availability')
async checkAvailability(@Param('id') id: string) {
  return await this.productService.getProductAvailability(id);
}
// Returns: { availableStock: 475, canBuy: true }
```

### Cart/Order Controller
```typescript
@Post('cart/add')
async addToCart(@Body() dto: AddToCartDto) {
  const result = await this.productService.buy(
    dto.productId,
    dto.quantity
  );
  
  if (!result.success) {
    throw new BadRequestException(
      `Only ${result.availableStock} items available`
    );
  }
  
  // Add to cart...
}
```

## Complete Purchase Flow

### 1. Add to Cart
```typescript
// Reserve stock
const result = await productService.buy(productId, quantity);

if (result.success) {
  // Add to cart in database
  await cartService.addItem(userId, productId, quantity);
}
```

### 2. Remove from Cart
```typescript
// Release reservation
await inventoryService.releaseReservation(productId, quantity);

// Remove from cart
await cartService.removeItem(userId, cartItemId);
```

### 3. Complete Checkout
```typescript
// Process payment
await paymentService.charge(amount);

// Confirm sale (moves from reserved to sold)
await inventoryService.confirmSale(productId, quantity);

// Clear cart
await cartService.clear(userId);
```

### 4. Cancel Order
```typescript
// Release reservation
await inventoryService.releaseReservation(productId, quantity);

// Update order status
await orderService.cancel(orderId);
```

## Error Handling

### Product Not Found
```typescript
try {
  const availability = await productService.getProductAvailability(id);
} catch (error) {
  // Returns { availableStock: 0, canBuy: false }
}
```

### Insufficient Stock
```typescript
const result = await productService.buy(id, 1000);
// result.success = false
// result.availableStock = 475 (actual available)
```

### Inventory Not Found
```typescript
// Falls back to Product.stock if inventory doesn't exist
const availability = await productService.getProductAvailability(id);
// Uses product.stock as fallback
```

## Caching Strategy

### Cache Key
```typescript
`product:${productId}:availability`
```

### Cache Duration
- **30 seconds** - Balance between performance and accuracy

### Cache Invalidation
- When stock is reserved (`buy()` method)
- When stock is released (call `inventoryService.releaseReservation()`)
- When stock is restocked (call `inventoryService.restock()`)

### Manual Cache Invalidation
```typescript
// After any inventory operation
await redisService.del(`product:${productId}:availability`);
```

## Testing

### Test Availability Check
```typescript
// Given: Product with 500 total, 25 reserved
const availability = await productService.getProductAvailability(productId);

expect(availability.availableStock).toBe(475); // 500 - 25
expect(availability.canBuy).toBe(true);
```

### Test Buy Operation
```typescript
// Given: Product with 475 available
const result = await productService.buy(productId, 5);

expect(result.success).toBe(true);
expect(result.availableStock).toBe(470); // 475 - 5
```

### Test Overselling Prevention
```typescript
// Given: Product with 475 available
const result = await productService.buy(productId, 500);

expect(result.success).toBe(false);
expect(result.availableStock).toBe(475);
```

## Module Dependencies

```
ProductModule
  ├─ imports: [InventoryModule] ✅
  └─ ProductService
      └─ constructor(inventoryService) ✅

InventoryModule
  ├─ exports: [InventoryService] ✅
  └─ InventoryService
```

## Summary

| Feature | Status |
|---------|--------|
| Accurate availability (accounts for reserved) | ✅ |
| Prevents overselling | ✅ |
| Stock reservation | ✅ |
| Cache invalidation | ✅ |
| Fallback to Product.stock | ✅ |
| Error handling | ✅ |
| Integration with InventoryService | ✅ |

---

**Result**: ProductService now provides accurate, real-time stock availability! 🎉
