# Stock Synchronization Strategy

## Overview

This application uses a **dual stock tracking** approach:

1. **Product.stock** - Simple integer field for quick queries
2. **Inventory table** - Detailed tracking with reserved, sold, and total stock

## Why Both?

### Product.stock (Simple Field)
- ✅ Fast queries for product listings
- ✅ No JOIN required for basic stock checks
- ✅ Easy to display in product cards
- ✅ Backward compatible with existing code

### Inventory Table (Detailed Tracking)
- ✅ Track reserved stock (items in carts/checkout)
- ✅ Track sold stock (historical data)
- ✅ Calculate available stock (total - reserved)
- ✅ Business logic for reservations and sales
- ✅ Audit trail and analytics

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    STOCK SYNCHRONIZATION                     │
└─────────────────────────────────────────────────────────────┘

Product Table                    Inventory Table
┌──────────────┐                ┌──────────────────────┐
│ id           │                │ productId            │
│ name         │                │ totalStock: 500      │
│ price        │                │ reservedStock: 25    │
│ stock: 500   │◄───────────────│ soldStock: 150       │
└──────────────┘    Synced      └──────────────────────┘
                    on change
```

## Synchronization Points

The system automatically syncs `Product.stock` with `Inventory.totalStock` when:

### 1. Seeding Data
```typescript
// seed-inventory.ts
product.stock = stockLevels.totalStock;
await productRepo.save(products);
```

### 2. Confirming Sale
```typescript
// inventory.service.ts
async confirmSale(productId, quantity) {
  // ... confirm sale logic
  await this.syncProductStock(productId, inventory.totalStock);
}
```

### 3. Restocking
```typescript
// inventory.service.ts
async restock(productId, quantity) {
  // ... restock logic
  await this.syncProductStock(productId, inventory.totalStock);
}
```

### 4. Upserting Inventory
```typescript
// inventory.service.ts
async upsert(productId, totalStock, ...) {
  // ... upsert logic
  await this.syncProductStock(productId, totalStock);
}
```

## When to Use Each

### Use Product.stock When:
- Displaying product listings
- Quick stock availability checks
- Filtering products by stock status
- Simple queries without detailed tracking

```typescript
// Example: Get products with stock
const products = await productRepo.find({
  where: { stock: MoreThan(0) }
});
```

### Use Inventory When:
- Reserving stock for checkout
- Managing cart items
- Confirming sales
- Restocking products
- Getting detailed stock analytics
- Tracking reserved vs available stock

```typescript
// Example: Reserve stock for checkout
await inventoryService.reserveStock(productId, quantity);
```

## Stock States Explained

```
Product.stock = 500
  │
  └─> Represents: Current total stock available
  
Inventory.totalStock = 500
  │
  ├─> Inventory.reservedStock = 25  (in carts/checkout)
  │
  └─> Available Stock = 475  (500 - 25)
      └─> This is what customers can actually buy
```

## Example Scenarios

### Scenario 1: Customer Adds to Cart
```typescript
// Reserve stock
await inventoryService.reserveStock(productId, 5);

// Result:
// Inventory.totalStock: 500 (unchanged)
// Inventory.reservedStock: 25 → 30 (+5)
// Product.stock: 500 (unchanged - still total stock)
```

### Scenario 2: Customer Completes Purchase
```typescript
// Confirm sale
await inventoryService.confirmSale(productId, 5);

// Result:
// Inventory.totalStock: 500 → 495 (-5)
// Inventory.reservedStock: 30 → 25 (-5)
// Inventory.soldStock: 150 → 155 (+5)
// Product.stock: 500 → 495 (-5) ✅ SYNCED
```

### Scenario 3: Admin Restocks
```typescript
// Restock
await inventoryService.restock(productId, 100);

// Result:
// Inventory.totalStock: 495 → 595 (+100)
// Inventory.reservedStock: 25 (unchanged)
// Inventory.soldStock: 155 (unchanged)
// Product.stock: 495 → 595 (+100) ✅ SYNCED
```

## Benefits of This Approach

1. **Performance**: Product listings don't need JOINs
2. **Flexibility**: Detailed tracking when needed
3. **Backward Compatible**: Existing code using Product.stock still works
4. **Data Integrity**: Automatic synchronization prevents drift
5. **Analytics**: Historical data in Inventory table
6. **Business Logic**: Reservation system without affecting simple queries

## Important Notes

⚠️ **Always use InventoryService for stock changes**
- Don't directly update Product.stock
- Use inventory methods which handle sync automatically

⚠️ **Product.stock = Inventory.totalStock**
- They should always match
- Sync happens automatically on changes

⚠️ **Available Stock ≠ Product.stock**
- Available = totalStock - reservedStock
- Product.stock shows total, not available

## Migration from Old System

If you were previously using only Product.stock:

```typescript
// Old way (don't do this anymore)
product.stock -= quantity;
await productRepo.save(product);

// New way (correct)
await inventoryService.confirmSale(productId, quantity);
// This updates both Inventory AND Product.stock
```

## Querying Examples

### Get Products with Available Stock
```typescript
// Option 1: Simple query (fast, but doesn't account for reserved)
const products = await productRepo.find({
  where: { stock: MoreThan(0) }
});

// Option 2: Detailed query (accurate, includes reserved stock)
const inventories = await inventoryRepo
  .createQueryBuilder('inv')
  .leftJoinAndSelect('inv.product', 'product')
  .where('inv.totalStock - inv.reservedStock > 0')
  .getMany();
```

### Check if Product Can Be Purchased
```typescript
// Use inventory service for accurate check
const canPurchase = await inventoryService.checkAvailability(
  productId,
  quantity
);
```

## Summary

| Field | Purpose | Updated When | Use For |
|-------|---------|--------------|---------|
| Product.stock | Quick reference | Sale/Restock | Listings, filters |
| Inventory.totalStock | Actual total | Sale/Restock | Management |
| Inventory.reservedStock | In carts | Reserve/Release | Checkout |
| Inventory.soldStock | Historical | Sale confirmed | Analytics |
| Available Stock (calc) | Can buy now | Auto-calculated | Purchase checks |

---

**Key Takeaway**: Use `Product.stock` for display, use `InventoryService` for all stock operations!
