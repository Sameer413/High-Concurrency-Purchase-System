import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queue.constants';
import {
  ConvertStockJobDto,
  CompleteReservationJobDto,
} from '../dto/payment-job.dto';

/**
 * Payment Queue Service
 * Provides methods to add payment processing jobs to the queue
 */
@Injectable()
export class PaymentQueueService {
  private readonly logger = new Logger(PaymentQueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.PAYMENT_PROCESSING)
    private readonly paymentQueue: Queue,
  ) {}

  /**
   * Queue stock conversion job
   * Converts reserved stock to sold stock
   */
  async queueStockConversion(data: ConvertStockJobDto): Promise<void> {
    try {
      await this.paymentQueue.add(JOB_NAMES.CONVERT_STOCK, data, {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        priority: 1, // High priority
      });

      this.logger.log(
        `Queued stock conversion for order ${data.orderNumber} (${data.orderId})`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to queue stock conversion for order ${data.orderNumber}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Queue reservation completion job
   * Marks reservation as completed
   */
  async queueReservationCompletion(
    data: CompleteReservationJobDto,
  ): Promise<void> {
    try {
      await this.paymentQueue.add(JOB_NAMES.COMPLETE_RESERVATION, data, {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        priority: 2, // Medium priority
      });

      this.logger.log(
        `Queued reservation completion for order ${data.orderNumber} (${data.orderId})`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to queue reservation completion for order ${data.orderNumber}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.paymentQueue.getWaitingCount(),
      this.paymentQueue.getActiveCount(),
      this.paymentQueue.getCompletedCount(),
      this.paymentQueue.getFailedCount(),
      this.paymentQueue.getDelayedCount(),
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
    return this.paymentQueue.getFailed(0, limit);
  }

  /**
   * Retry a failed job
   */
  async retryFailedJob(jobId: string) {
    const job = await this.paymentQueue.getJob(jobId);
    if (job) {
      await job.retry();
      this.logger.log(`Retrying failed job: ${jobId}`);
    }
  }

  /**
   * Clean old jobs
   */
  async cleanOldJobs() {
    const grace = 7 * 24 * 3600 * 1000; // 7 days
    await this.paymentQueue.clean(grace, 100, 'completed');
    await this.paymentQueue.clean(30 * 24 * 3600 * 1000, 500, 'failed'); // Keep failed for 30 days
    this.logger.log('Cleaned old jobs from payment queue');
  }

  /**
   * Cancel scheduled reservation cleanup
   * Call this when payment is successful
   */
  async cancelReservationCleanup(reservationId: string): Promise<void> {
    // This is handled by InventoryQueueService, but we provide a passthrough
    // for convenience when called from payment service
    this.logger.log(`Payment successful, cleanup will be skipped for reservation ${reservationId}`);
    // Note: The cleanup job will check reservation status and skip if COMPLETED
  }
}
