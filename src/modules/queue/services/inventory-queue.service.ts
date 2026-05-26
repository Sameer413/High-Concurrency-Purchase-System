import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queue.constants';
import { CleanupSingleReservationJobDto } from '../dto/inventory-job.dto';

/**
 * Inventory Queue Service
 * Provides methods to add inventory cleanup jobs to the queue
 */
@Injectable()
export class InventoryQueueService {
  private readonly logger = new Logger(InventoryQueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.INVENTORY_CLEANUP)
    private readonly inventoryQueue: Queue,
  ) {}

  /**
   * Schedule cleanup for a single reservation at its expiration time
   * This is called when a reservation is created
   */
  async scheduleReservationCleanup(
    reservationId: string,
    expiresAt: Date,
  ): Promise<void> {
    try {
      // Calculate delay until expiration
      const delay = expiresAt.getTime() - Date.now();

      // Don't schedule if already expired
      if (delay < 0) {
        this.logger.warn(
          `Reservation ${reservationId} already expired, not scheduling cleanup`,
        );
        return;
      }

      await this.inventoryQueue.add(
        JOB_NAMES.CLEANUP_SINGLE_RESERVATION,
        { reservationId } as CleanupSingleReservationJobDto,
        {
          delay, // Run at exact expiration time
          jobId: `cleanup-${reservationId}`, // Unique ID prevents duplicates
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );

      this.logger.log(
        `Scheduled cleanup for reservation ${reservationId} at ${expiresAt.toISOString()} (in ${Math.round(delay / 1000)}s)`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to schedule cleanup for reservation ${reservationId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Cancel scheduled cleanup for a reservation
   * Call this when payment is successful
   */
  async cancelReservationCleanup(reservationId: string): Promise<void> {
    try {
      const jobId = `cleanup-${reservationId}`;
      const job = await this.inventoryQueue.getJob(jobId);

      if (job) {
        await job.remove();
        this.logger.log(
          `Cancelled cleanup for reservation ${reservationId} (payment successful)`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to cancel cleanup for reservation ${reservationId}: ${error.message}`,
      );
      // Don't throw - cleanup will check status anyway
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.inventoryQueue.getWaitingCount(),
      this.inventoryQueue.getActiveCount(),
      this.inventoryQueue.getCompletedCount(),
      this.inventoryQueue.getFailedCount(),
      this.inventoryQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Get failed jobs for debugging
   */
  async getFailedJobs(limit = 10) {
    return this.inventoryQueue.getFailed(0, limit);
  }

  /**
   * Retry a failed job
   */
  async retryFailedJob(jobId: string) {
    const job = await this.inventoryQueue.getJob(jobId);
    if (job) {
      await job.retry();
      this.logger.log(`Retrying failed job: ${jobId}`);
    }
  }
}
