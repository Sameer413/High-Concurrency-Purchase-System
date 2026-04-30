# Inventory Module

The Inventory module manages product stock levels, reservations, and sales tracking for the e-commerce platform.

## 🔄 Stock Synchronization

This module uses **dual stock tracking**:
- **Product.stock**: Simple integer field (for fast queries in product listings)
- **Inventory table**: Detailed tracking (total, reserved, sold)

Both are **automatically synchronized** when using InventoryService methods. See [STOCK_SYNC_STRATEGY.md](./STOCK_SYNC_STRATEGY.md) for details.

## Features

- **Stock Management**: Track total stock, reserved stock, and sold stock for each product
- **Stock Reservation**: Reserve stock when items are added to cart or during checkout
- **Sale Confirmation**: Move reserved stock to sold when orders are completed
- **Restock Management**: Add new stock to products
- **Low Stock Alerts**: Identify products running low on inventory
- **Statistics**: Get comprehensive inventory statistics

## Entity Structure

### Inventory Entity

```typescript
{
  id: string;                 // UUID
  productId: string;          // Foreign key to Product
  totalStock: number;         // Current total stock available
  reservedStock: number;      // Stock reserved (in carts/checkout)
  soldStock: number;          // Historical sold stock count
  createdAt: Date;
  updatedAt: Date;
}
```

### Computed Properties

- `availableStock`: `totalStock - reservedStock` (stock available for new reservations)

### Helper Methods

- `canReserve(quantity)`: Check if quantity can be reserved
- `reserve(quantity)`: Reserve stock
- `releaseReservation(quantity)`: Release reserved stock
- `confirmSale(quantity)`: Move from reserved to sold
- `restock(quantity)`: Add new stock

## Database Constraints

- All stock values must be >= 0
- Reserved stock cannot exceed total stock
- Enforced at database level with CHECK constraints

## API Endpoints

### Public Endpoints

#### Get Product Inventory
```
GET /inventory/product/:productId
```
Returns inventory details for a specific product.

#### Check Availability
```
GET /inventory/product/:productId/availability?quantity=5
```
Check if a specific quantity is available for purchase.

### Admin Endpoints

#### Get Low Stock Items
```
GET /inventory/low-stock?threshold=50
```
Returns products with available stock below the threshold (default: 50).

#### Get Statistics
```
GET /inventory/statistics
```
Returns comprehensive inventory statistics:
- Total stock across all products
- Total reserved stock
- Total sold stock
- Average stock per product
- Count of low stock items
- Count of out-of-stock items

#### Reserve Stock
```
POST /inventory/product/:productId/reserve
Body: { "quantity": 5 }
```
Reserve stock for a product (typically called by cart/checkout service).

#### Release Reservation
```
POST /inventory/product/:productId/release
Body: { "quantity": 5 }
```
Release previously reserved stock (e.g., when cart item is removed).

#### Confirm Sale
```
POST /inventory/product/:productId/confirm-sale
Body: { "quantity": 5 }
```
Confirm a sale by moving stock from reserved to sold.

#### Restock Product
```
POST /inventory/product/:productId/restock
Body: { "quantity": 100 }
```
Add new stock to a product.

## Service Methods

### InventoryService

- `getByProductId(productId)`: Get inventory for a product
- `checkAvailability(productId, quantity)`: Check if stock is available
- `reserveStock(productId, quantity)`: Reserve stock
- `releaseReservation(productId, quantity)`: Release reserved stock
- `confirmSale(productId, quantity)`: Confirm sale
- `restock(productId, quantity)`: Add stock
- `getLowStockItems(threshold)`: Get products with low stock
- `getStatistics()`: Get inventory statistics
- `upsert(productId, totalStock, reservedStock, soldStock)`: Create or update inventory

## Seeding Data

### Seed Inventory for All Products

```bash
npm run seed:inventory
```

This will:
1. Clear existing inventory data
2. Generate inventory for all products in the database
3. Calculate stock levels based on:
   - Product category (different categories have different base stock levels)
   - Number of sizes and colors available
   - Product popularity (rating and reviews)
4. Generate realistic reserved and sold stock numbers

### Seed Both Products and Inventory

```bash
npm run seed:all
```

This runs both product and inventory seeding in sequence.

## Stock Level Generation Logic

The seeder generates realistic stock levels:

1. **Base Stock by Category**:
   - T-Shirts: 200-700 units
   - Shirts: 150-550 units
   - Jackets: 50-250 units
   - Pants: 100-400 units
   - Hoodies: 150-500 units
   - Accessories: 300-900 units

2. **Multipliers**:
   - Size multiplier: Based on number of sizes (capped at 4)
   - Color multiplier: Based on number of colors (capped at 3)

3. **Sold Stock**:
   - 10-40% of total stock marked as sold
   - Popular items (rating >= 4.5, reviews > 1000) have 50% more sales

4. **Reserved Stock**:
   - 1-5% of remaining stock is reserved

## Integration with Order Flow

### Typical Order Flow

1. **Add to Cart**: Reserve stock
   ```typescript
   await inventoryService.reserveStock(productId, quantity);
   ```

2. **Remove from Cart**: Release reservation
   ```typescript
   await inventoryService.releaseReservation(productId, quantity);
   ```

3. **Complete Order**: Confirm sale
   ```typescript
   await inventoryService.confirmSale(productId, quantity);
   ```

4. **Cancel Order**: Release reservation
   ```typescript
   await inventoryService.releaseReservation(productId, quantity);
   ```

## Error Handling

The service throws appropriate exceptions:

- `NotFoundException`: When inventory record doesn't exist for a product
- `BadRequestException`: When:
  - Insufficient stock for reservation
  - Cannot confirm sale (not enough reserved stock)
  - Invalid restock quantity (must be positive)

## Future Enhancements

- [ ] Add inventory history tracking
- [ ] Implement automatic reorder points
- [ ] Add warehouse/location support for multi-location inventory
- [ ] Implement batch operations for bulk updates
- [ ] Add inventory adjustment reasons/notes
- [ ] Implement stock transfer between locations
- [ ] Add inventory forecasting based on sales trends
