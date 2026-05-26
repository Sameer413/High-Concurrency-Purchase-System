import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queue.constants';
import {
  InitiateRefundJobDto,
  CheckRefundStatusJobDto,
} from '../dto/refund-job.dto';

/**
 * Refund Queue Service
 * Provides methods to add refund processing jobs to the queue
 */
@Injectable()
export class RefundQueueService {
  private readonly logger = new Logger(RefundQueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.REFUND_PROCESSING)
    private readonly refundQueue: Queue,
  ) {}

  /**
   * Queue refund initiation
   * Creates a refund request with Razorpay
   */
  async queueRefundInitiation(data: InitiateRefundJobDto): Promise<void> {
    try {
      await this.refundQueue.add(JOB_NAMES.INITIATE_REFUND, data, {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        jobId: `refund-init-${data.orderId}`, // Prevent duplicate refund initiations
      });

      this.logger.log(
        `Queued refund initiation for order ${data.orderNumber} (${data.orderId})`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to queue refund initiation for order ${data.orderNumber}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Queue refund status check
   * Polls Razorpay for refund status updates
   */
  async queueRefundStatusCheck(
    data: CheckRefundStatusJobDto,
    delay: number = 0,
  ): Promise<void> {
    try {
      await this.refundQueue.add(JOB_NAMES.CHECK_REFUND_STATUS, data, {
        delay,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        jobId: `refund-status-${data.refundId}-${data.attemptNumber}`,
      });

      this.logger.log(
        `Queued refund status check for order ${data.orderNumber}, attempt ${data.attemptNumber}${delay > 0 ? ` (delayed ${delay}ms)` : ''}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to queue refund status check for order ${data.orderNumber}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.refundQueue.getWaitingCount(),
      this.refundQueue.getActiveCount(),
      this.refundQueue.getCompletedCount(),
      this.refundQueue.getFailedCount(),
      this.refundQueue.getDelayedCount(),
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
    return this.refundQueue.getFailed(0, limit);
  }

  /**
   * Retry a failed job
   */
  async retryFailedJob(jobId: string) {
    const job = await this.refundQueue.getJob(jobId);
    if (job) {
      await job.retry();
      this.logger.log(`Retrying failed refund job: ${jobId}`);
    }
  }
}
