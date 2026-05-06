import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queue.constants';
import {
  OrderConfirmationEmailDto,
  PaymentSuccessEmailDto,
  PaymentFailedEmailDto,
} from '../dto/email-job.dto';

/**
 * Email Queue Service
 * Provides methods to add email jobs to the queue
 */
@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL_NOTIFICATIONS)
    private readonly emailQueue: Queue,
  ) {}

  /**
   * Queue order confirmation email
   */
  async queueOrderConfirmation(data: OrderConfirmationEmailDto): Promise<void> {
    try {
      await this.emailQueue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });

      this.logger.log(
        `Queued order confirmation email for order ${data.orderId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to queue order confirmation email for order ${data.orderId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Queue payment success email
   */
  async queuePaymentSuccess(data: PaymentSuccessEmailDto): Promise<void> {
    try {
      await this.emailQueue.add(JOB_NAMES.SEND_PAYMENT_SUCCESS, data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });

      this.logger.log(`Queued payment success email for order ${data.orderId}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to queue payment success email for order ${data.orderId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Queue payment failed email
   */
  async queuePaymentFailed(data: PaymentFailedEmailDto): Promise<void> {
    try {
      await this.emailQueue.add(JOB_NAMES.SEND_PAYMENT_FAILED, data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });

      this.logger.log(`Queued payment failed email for order ${data.orderId}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to queue payment failed email for order ${data.orderId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.emailQueue.getWaitingCount(),
      this.emailQueue.getActiveCount(),
      this.emailQueue.getCompletedCount(),
      this.emailQueue.getFailedCount(),
      this.emailQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
    };
  }

  /**
   * Get failed jobs for debugging
   */
  async getFailedJobs(limit = 10) {
    return this.emailQueue.getFailed(0, limit);
  }

  /**
   * Retry a failed job
   */
  async retryFailedJob(jobId: string) {
    const job = await this.emailQueue.getJob(jobId);
    if (job) {
      await job.retry();
      this.logger.log(`Retrying failed job ${jobId}`);
    }
  }

  /**
   * Clean old jobs
   */
  async cleanOldJobs() {
    const grace = 24 * 3600 * 1000; // 24 hours
    await this.emailQueue.clean(grace, 100, 'completed');
    await this.emailQueue.clean(7 * 24 * 3600 * 1000, 500, 'failed'); // Keep failed for 7 days
    this.logger.log('Cleaned old jobs from email queue');
  }
}
