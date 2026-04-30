import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from 'src/database/redis/redis.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Release expired stock reservations
   * Run this periodically (e.g., every 2 minutes)
   * 
   * FIX for Bug 3: Redis key may expire but reservedStock in DB stays reserved.
   * We check DB for products with reservedStock > 0 but no active Redis key.
   */
  async releaseExpiredReservations(): Promise<void> {
    this.logger.log('Starting expired reservation cleanup...');

    const redisClient = this.redisService.getClient();

    // Find all products with reserved stock in DB
    const productsWithReservedStock = await this.dataSource.query(
      `
      SELECT "productId", "reservedStock"
      FROM inventory
      WHERE "reservedStock" > 0
      `,
    );

    if (productsWithReservedStock.length === 0) {
      this.logger.log('No products with reserved stock found');
      return;
    }

    this.logger.log(`Found ${productsWithReservedStock.length} products with reserved stock`);

    let releasedCount = 0;
    let checkedCount = 0;

    for (const row of productsWithReservedStock) {
      checkedCount++;
      const productId = row.productId;
      const reservedStock = Number(row.reservedStock);

      try {
        // Check if there's an active reservation key for this product
        const reservationKeys = await redisClient.keys(`reservation:${productId}:*`);

        if (reservationKeys.length === 0) {
          // No active reservation key - release all reserved stock
          this.logger.log(
            `Releasing ${reservedStock} reserved stock for product ${productId} (no active Redis key)`,
          );

          await this.releaseStockForProduct(productId, reservedStock);
          releasedCount++;
        }
      } catch (error) {
        this.logger.error(
          `Error processing product ${productId}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    this.logger.log(
      `Cleanup complete. Checked: ${checkedCount}, Released: ${releasedCount}`,
    );
  }

  /**
   * Release stock for a specific product
   */
  private async releaseStockForProduct(productId: string, quantity: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Release the reserved stock
      await manager.query(
        `
        UPDATE inventory
        SET "reservedStock" = GREATEST(0, "reservedStock" - $2),
            "updatedAt" = NOW()
        WHERE "productId" = $1
        `,
        [productId, quantity],
      );

      // Update Product.stock to match Inventory.totalStock
      await manager.query(
        `
        UPDATE products
        SET stock = (
          SELECT "totalStock" 
          FROM inventory 
          WHERE "productId" = $1
        )
        WHERE id = $1
        `,
        [productId],
      );
    });
  }

  /**
   * Get current reservation statistics
   */
  async getReservationStats() {
    const redisClient = this.redisService.getClient();
    const reservationKeys = await redisClient.keys('reservation:*');
    
    return {
      totalReservations: reservationKeys.length,
      reservationKeys,
    };
  }
}
