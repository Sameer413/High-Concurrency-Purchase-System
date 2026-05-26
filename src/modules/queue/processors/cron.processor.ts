import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import {
  Reservation,
  ReservationStatus,
} from '../../inventory/entities/reservation.entity';
import { InventoryService } from '../../inventory/inventory.service';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queue.constants';
import { RedisService } from 'src/database/redis/redis.service';

/**
 * Cron Queue Processor
 * Handles scheduled maintenance jobs like orphaned reservation cleanup
 */
@Processor(QUEUE_NAMES.CRON_JOBS)
export class CronProcessor extends WorkerHost {
  private readonly logger = new Logger(CronProcessor.name);

  constructor(
    private readonly inventoryService: InventoryService,
    @InjectRepository(Reservation)
    private readonly reservationRepo: Repository<Reservation>,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  /**
   * Main process method - routes jobs to appropriate handlers
   */
  async process(job: Job): Promise<any> {
    this.logger.log(`Processing cron job ${job.name} with ID ${job.id}`);

    try {
      switch (job.name) {
        case JOB_NAMES.CLEANUP_ORPHANED_RESERVATIONS:
          return await this.handleOrphanedReservationsCleanup(job);

        case JOB_NAMES.REDIS_HEALTH_CHECK:
          return await this.handleRedisHealthCheck(job);

        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
          throw new Error(`Unknown job name: ${job.name}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to process cron job ${job.name} (ID: ${job.id}): ${error.message}`,
        error.stack,
      );
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Cleanup Orphaned Reservations
   * Runs periodically to find and clean up expired reservations that weren't processed
   * This handles cases where:
   * - Redis crashed and scheduled cleanup jobs were lost
   * - Cleanup jobs failed after max retries
   * - System was down during expiration time
   */
  private async handleOrphanedReservationsCleanup(job: Job): Promise<void> {
    this.logger.log('Starting orphaned reservations cleanup');

    const startTime = Date.now();
    let cleanedCount = 0;
    let errorCount = 0;

    try {
      // Find all ACTIVE reservations that have expired
      // Add a 1-minute buffer to avoid race conditions with scheduled cleanup
      const bufferTime = new Date(Date.now() - 60 * 1000); // 1 minute ago

      const orphanedReservations = await this.reservationRepo.find({
        where: {
          status: ReservationStatus.ACTIVE,
          expiresAt: LessThan(bufferTime),
        },
        order: {
          expiresAt: 'ASC',
        },
        take: 100, // Process in batches to avoid overwhelming the system
      });

      if (orphanedReservations.length === 0) {
        this.logger.log('No orphaned reservations found');
        return;
      }

      this.logger.log(
        `Found ${orphanedReservations.length} orphaned reservations to clean up`,
      );

      // Process each orphaned reservation
      for (const reservation of orphanedReservations) {
        try {
          await this.cleanupSingleOrphanedReservation(reservation);
          cleanedCount++;
        } catch (error: any) {
          errorCount++;
          this.logger.error(
            `Failed to cleanup orphaned reservation ${reservation.id}: ${error.message}`,
            error.stack,
          );
          // Continue with next reservation
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Orphaned reservations cleanup completed: ${cleanedCount} cleaned, ${errorCount} errors, ${duration}ms`,
      );

      // If there were errors, log them for monitoring
      if (errorCount > 0) {
        this.logger.warn(
          `⚠️ Orphaned cleanup had ${errorCount} errors - check logs for details`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Critical error in orphaned reservations cleanup: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Clean up a single orphaned reservation
   */
  private async cleanupSingleOrphanedReservation(
    reservation: Reservation,
  ): Promise<void> {
    return await this.dataSource.transaction(async (manager) => {
      // Re-fetch with lock to prevent race conditions
      const lockedReservation = await manager.findOne(Reservation, {
        where: { id: reservation.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedReservation) {
        this.logger.warn(`Reservation ${reservation.id} not found (already cleaned up?)`);
        return;
      }

      // Double-check status (might have been processed by another job)
      if (lockedReservation.status !== ReservationStatus.ACTIVE) {
        this.logger.log(
          `Reservation ${reservation.id} already processed (status: ${lockedReservation.status})`,
        );
        return;
      }

      // Double-check expiration (safety check)
      if (lockedReservation.expiresAt > new Date()) {
        this.logger.warn(
          `Reservation ${reservation.id} not expired yet (expires at ${lockedReservation.expiresAt.toISOString()})`,
        );
        return;
      }

      this.logger.log(
        `Cleaning up orphaned reservation ${reservation.id} (expired at ${lockedReservation.expiresAt.toISOString()})`,
      );

      // Release stock for each item
      if (lockedReservation.items && Array.isArray(lockedReservation.items)) {
        for (const item of lockedReservation.items) {
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
      else if (lockedReservation.productId && lockedReservation.quantity) {
        this.logger.log(
          `Releasing ${lockedReservation.quantity} units of product ${lockedReservation.productId} (legacy)`,
        );

        await this.inventoryService.releaseReservationTx(
          manager,
          lockedReservation.productId,
          lockedReservation.quantity,
        );
      }

      // Mark reservation as expired
      lockedReservation.status = ReservationStatus.EXPIRED;
      await manager.save(lockedReservation);

      // Clean up Redis cache if it exists
      try {
        await this.redisService.del(`r:${reservation.id}`);
      } catch (error: any) {
        this.logger.warn(
          `Failed to delete Redis cache for reservation ${reservation.id}: ${error.message}`,
        );
        // Don't throw - DB cleanup is more important
      }

      this.logger.log(
        `Successfully cleaned up orphaned reservation ${reservation.id}`,
      );
    });
  }

  /**
   * Redis Health Check
   * Monitors Redis connectivity and logs warnings if Redis is down
   */
  private async handleRedisHealthCheck(job: Job): Promise<void> {
    this.logger.log('Running Redis health check');

    try {
      // Try to ping Redis
      const testKey = 'health:check:test';
      const testValue = Date.now().toString();

      await this.redisService.set(testKey, testValue, 10);
      const retrieved = await this.redisService.get(testKey);

      if (retrieved === testValue) {
        this.logger.log('✅ Redis health check passed');
        return;
      } else {
        this.logger.error(
          '❌ Redis health check failed: value mismatch',
        );
        // TODO: Send alert to monitoring system
      }
    } catch (error: any) {
      this.logger.error(
        `❌ Redis health check failed: ${error.message}`,
        error.stack,
      );
      // TODO: Send alert to monitoring system
      throw error;
    }
  }
}
