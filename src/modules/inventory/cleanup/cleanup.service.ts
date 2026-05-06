import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReservationStatus } from '../entities/reservation.entity';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Release expired stock reservations
   * Run this periodically (e.g., every 5 minutes via CleanupJob)
   * 
   * This uses the Postgres `reservations` table to cleanly identify
   * expired reservations and releases their stock atomically.
   */
  async releaseExpiredReservations(): Promise<void> {
    this.logger.log('Starting expired reservation cleanup...');

    // 1. Find all ACTIVE reservations that have expired
    const expiredReservations = await this.dataSource.query(
      `
      SELECT id, items
      FROM reservations
      WHERE status = $1 AND "expiresAt" < NOW()
      `,
      [ReservationStatus.ACTIVE],
    );

    if (expiredReservations.length === 0) {
      this.logger.log('No expired reservations found');
      return;
    }

    this.logger.log(`Found ${expiredReservations.length} expired reservations to clean up.`);

    let releasedCount = 0;

    for (const reservation of expiredReservations) {
      try {
        await this.dataSource.transaction(async (manager) => {
          // 2. Mark reservation as EXPIRED
          await manager.query(
            `UPDATE reservations SET status = $1 WHERE id = $2`,
            [ReservationStatus.EXPIRED, reservation.id],
          );

          // 3. Release reserved stock for each item in the reservation
          const items = reservation.items || [];
          for (const item of items) {
            if (item.productId && item.quantity) {
              await manager.query(
                `
                UPDATE inventory
                SET "reservedStock" = GREATEST(0, "reservedStock" - $2),
                    "updatedAt" = NOW()
                WHERE "productId" = $1
                `,
                [item.productId, item.quantity],
              );
              this.logger.log(`Released ${item.quantity} stock for product ${item.productId} (Reservation: ${reservation.id})`);
            }
          }
        });
        releasedCount++;
      } catch (error) {
        this.logger.error(
          `Error releasing stock for reservation ${reservation.id}:`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `Cleanup complete. Successfully released stock for ${releasedCount} expired reservations.`,
    );
  }
}
