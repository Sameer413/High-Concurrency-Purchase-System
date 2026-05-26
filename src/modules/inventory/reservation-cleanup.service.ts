import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { InventoryService } from './inventory.service';

import { Order } from '../order/entities/order.entity';

@Injectable()
export class ReservationCleanupService {
  private readonly logger = new Logger(ReservationCleanupService.name);

  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepo: Repository<Reservation>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Safety net: Runs every 30 minutes to catch any missed cleanups
   * Primary cleanup is now event-driven via queue jobs
   * This serves as a backup for edge cases:
   * - Queue job failed to schedule
   * - Redis was down during reservation creation
   * - Old reservations created before queue implementation
   */
  @Cron('*/30 * * * *') // Every 30 minutes (was every 1 minute)
  async handleExpiredReservations() {
    try {
      const expiredReservations = await this.reservationRepo.find({
        where: {
          status: ReservationStatus.ACTIVE,
          expiresAt: LessThan(new Date()),
        },
        take: 100, // Limit to 100 at a time
      });

      if (expiredReservations.length === 0) {
        this.logger.log('Safety net: No expired reservations found');
        return; // Nothing to clean up
      }

      this.logger.warn(
        `Safety net: Found ${expiredReservations.length} expired reservations (queue may have missed these)`,
      );

      for (const reservation of expiredReservations) {
        try {
          // Release stock for v2 (items jsonb array)
          if (reservation.items && Array.isArray(reservation.items)) {
            for (const item of reservation.items) {
              if (item.productId && item.quantity) {
                await this.inventoryService.releaseReservation(
                  item.productId,
                  item.quantity,
                );
              }
            }
          } 
          // Release stock for v1 (legacy direct productId/quantity)
          else if (reservation.productId && reservation.quantity) {
            await this.inventoryService.releaseReservation(
              reservation.productId,
              reservation.quantity,
            );
          }

          // Mark as expired
          reservation.status = ReservationStatus.EXPIRED;
          await this.reservationRepo.save(reservation);

          // Find any associated Order and mark it as CANCELLED
          const order = await this.orderRepo.findOne({
            where: { reservationId: reservation.id },
          });

          if (order && order.status === 'PENDING') {
            order.status = 'CANCELLED';
            order.cancelledAt = new Date();
            await this.orderRepo.save(order);
            this.logger.log(`Cancelled orphaned order ${order.orderNumber} for expired reservation ${reservation.id}`);
          }

          this.logger.log(`Safety net: Released stock for expired reservation ${reservation.id}`);
        } catch (error: unknown) {
          if (error instanceof Error) {
            this.logger.error(
              `Failed to release stock for reservation ${reservation.id}: ${error.message}`,
              error.stack,
            );
          } else {
             this.logger.error(
              `Failed to release stock for reservation ${reservation.id}: ${String(error)}`
            );
          }
        }
      }
    } catch (error) {
      this.logger.error('Error running reservation cleanup safety net', error);
    }
  }
}
