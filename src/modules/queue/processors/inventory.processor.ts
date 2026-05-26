import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order } from '../../order/entities/order.entity';
import {
  Reservation,
  ReservationStatus,
} from '../../inventory/entities/reservation.entity';
import { InventoryService } from '../../inventory/inventory.service';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queue.constants';
import { CleanupSingleReservationJobDto } from '../dto/inventory-job.dto';

/**
 * Inventory Queue Processor
 * Handles all inventory-related background jobs
 */
@Processor(QUEUE_NAMES.INVENTORY_CLEANUP)
export class InventoryProcessor extends WorkerHost {
  private readonly logger = new Logger(InventoryProcessor.name);

  constructor(
    private readonly inventoryService: InventoryService,
    @InjectRepository(Reservation)
    private readonly reservationRepo: Repository<Reservation>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  /**
   * Main process method - routes jobs to appropriate handlers
   */
  async process(job: Job): Promise<any> {
    this.logger.log(`Processing job ${job.name} with ID ${job.id}`);

    try {
      switch (job.name) {
        case JOB_NAMES.CLEANUP_SINGLE_RESERVATION:
          return await this.handleCleanupSingleReservation(job);

        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
          throw new Error(`Unknown job name: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process job ${job.name} (ID: ${job.id}): ${error.message}`,
        error.stack,
      );
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Handle Single Reservation Cleanup
   * Runs at exact expiration time for each reservation
   */
  private async handleCleanupSingleReservation(
    job: Job<CleanupSingleReservationJobDto>,
  ): Promise<void> {
    const { reservationId } = job.data;

    this.logger.log(`Cleaning up reservation ${reservationId}`);

    return await this.dataSource.transaction(async (manager) => {
      // 1. Find reservation
      const reservation = await manager.findOne(Reservation, {
        where: { id: reservationId },
      });

      if (!reservation) {
        this.logger.warn(`Reservation ${reservationId} not found`);
        return;
      }

      // 2. Check if still active (might have been paid)
      if (reservation.status !== ReservationStatus.ACTIVE) {
        this.logger.log(
          `Reservation ${reservationId} already processed (status: ${reservation.status})`,
        );
        return;
      }

      // 3. Double-check if actually expired (safety check)
      if (reservation.expiresAt > new Date()) {
        this.logger.warn(
          `Reservation ${reservationId} not expired yet (expires at ${reservation.expiresAt.toISOString()})`,
        );
        return;
      }

      // 4. Release stock for each item
      if (reservation.items && Array.isArray(reservation.items)) {
        for (const item of reservation.items) {
          if (item.productId && item.quantity) {
            this.logger.log(
              `Releasing ${item.quantity} units of product ${item.productId}`,
            );

            await this.inventoryService.releaseReservationTx(
              manager,
              item.productId,
              item.quantity,
            );
          }
        }
      }
      // Legacy support: single productId/quantity
      else if (reservation.productId && reservation.quantity) {
        this.logger.log(
          `Releasing ${reservation.quantity} units of product ${reservation.productId} (legacy)`,
        );

        await this.inventoryService.releaseReservationTx(
          manager,
          reservation.productId,
          reservation.quantity,
        );
      }

      // 5. Mark reservation as expired
      reservation.status = ReservationStatus.EXPIRED;
      await manager.save(reservation);

      // 6. Cancel associated order if exists
      const order = await manager.findOne(Order, {
        where: { reservationId: reservation.id },
      });

      if (order && order.status === 'PENDING') {
        order.status = 'CANCELLED';
        order.cancelledAt = new Date();
        await manager.save(order);

        this.logger.log(
          `Cancelled order ${order.orderNumber} for expired reservation`,
        );
      }

      this.logger.log(
        `Successfully cleaned up reservation ${reservationId}`,
      );
    });
  }
}
