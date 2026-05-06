import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, BadRequestException } from '@nestjs/common';
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
import {
  ConvertStockJobDto,
  CompleteReservationJobDto,
} from '../dto/payment-job.dto';

/**
 * Payment Queue Processor
 * Handles all payment-related background jobs
 */
@Processor(QUEUE_NAMES.PAYMENT_PROCESSING)
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private readonly inventoryService: InventoryService,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Reservation)
    private readonly reservationRepo: Repository<Reservation>,
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
        case JOB_NAMES.CONVERT_STOCK:
          return await this.handleStockConversion(job);

        case JOB_NAMES.COMPLETE_RESERVATION:
          return await this.handleReservationCompletion(job);

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
   * Handle Stock Conversion
   * Converts reserved stock to sold stock
   */
  private async handleStockConversion(
    job: Job<ConvertStockJobDto>,
  ): Promise<void> {
    const { orderId, orderNumber, reservationId, items } = job.data;

    this.logger.log(
      `Converting stock for order ${orderNumber} (${orderId})`,
    );

    return await this.dataSource.transaction(async (manager) => {
      // 1. Verify order exists and is in PAID status
      const order = await manager.findOne(Order, {
        where: { id: orderId },
      });

      if (!order) {
        this.logger.error(`Order not found: ${orderId}`);
        throw new Error(`Order not found: ${orderId}`);
      }

      if (order.status !== 'PAID') {
        this.logger.warn(
          `Order ${orderNumber} is not in PAID status (current: ${order.status}). Skipping stock conversion.`,
        );
        return;
      }

      // 2. Check if reservation exists
      const reservation = await manager.findOne(Reservation, {
        where: { id: reservationId },
      });

      if (!reservation) {
        this.logger.error(`Reservation not found: ${reservationId}`);
        throw new Error(`Reservation not found: ${reservationId}`);
      }

      // 3. Check if already completed (idempotency)
      if (reservation.status === ReservationStatus.COMPLETED) {
        this.logger.log(
          `Reservation ${reservationId} already completed. Skipping.`,
        );
        return;
      }

      // 4. Convert stock for each item
      try {
        for (const item of items) {
          this.logger.log(
            `Converting stock for product ${item.productId}: ${item.quantity} units`,
          );

          await this.inventoryService.confirmSaleTx(
            manager,
            item.productId,
            item.quantity,
          );
        }

        this.logger.log(
          `Successfully converted stock for order ${orderNumber}`,
        );
      } catch (error) {
        if (error instanceof BadRequestException) {
          // Stock was released or unavailable (Late Payment Edge Case)
          this.logger.error(
            `Stock unavailable for order ${orderNumber}. Marking as NEEDS_REFUND.`,
          );

          // Update order status to NEEDS_REFUND
          order.status = 'NEEDS_REFUND';
          await manager.save(order);

          // Mark reservation as EXPIRED
          reservation.status = ReservationStatus.EXPIRED;
          await manager.save(reservation);

          throw new Error(
            `Stock unavailable for order ${orderNumber}. Order marked as NEEDS_REFUND.`,
          );
        } else {
          throw error;
        }
      }
    });
  }

  /**
   * Handle Reservation Completion
   * Marks reservation as completed after stock conversion
   */
  private async handleReservationCompletion(
    job: Job<CompleteReservationJobDto>,
  ): Promise<void> {
    const { orderId, orderNumber, reservationId } = job.data;

    this.logger.log(
      `Completing reservation for order ${orderNumber} (${orderId})`,
    );

    return await this.dataSource.transaction(async (manager) => {
      // 1. Find reservation
      const reservation = await manager.findOne(Reservation, {
        where: { id: reservationId },
      });

      if (!reservation) {
        this.logger.error(`Reservation not found: ${reservationId}`);
        throw new Error(`Reservation not found: ${reservationId}`);
      }

      // 2. Check if already completed (idempotency)
      if (reservation.status === ReservationStatus.COMPLETED) {
        this.logger.log(
          `Reservation ${reservationId} already completed. Skipping.`,
        );
        return;
      }

      // 3. Verify order is in PAID status
      const order = await manager.findOne(Order, {
        where: { id: orderId },
      });

      if (!order) {
        this.logger.error(`Order not found: ${orderId}`);
        throw new Error(`Order not found: ${orderId}`);
      }

      if (order.status !== 'PAID') {
        this.logger.warn(
          `Order ${orderNumber} is not in PAID status (current: ${order.status}). Cannot complete reservation.`,
        );
        return;
      }

      // 4. Mark reservation as completed
      reservation.status = ReservationStatus.COMPLETED;
      await manager.save(reservation);

      this.logger.log(
        `Successfully completed reservation for order ${orderNumber}`,
      );
    });
  }
}
