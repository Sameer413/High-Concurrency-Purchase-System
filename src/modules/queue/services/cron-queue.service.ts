import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queue.constants';

/**
 * Cron Queue Service
 * Provides methods to schedule recurring maintenance jobs
 */
@Injectable()
export class CronQueueService {
  private readonly logger = new Logger(CronQueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.CRON_JOBS)
    private readonly cronQueue: Queue,
  ) {}

  /**
   * Schedule orphaned reservations cleanup
   * Runs every 5 minutes to clean up reservations that weren't processed
   */
  async scheduleOrphanedReservationsCleanup(): Promise<void> {
    try {
      await this.cronQueue.add(
        JOB_NAMES.CLEANUP_ORPHANED_RESERVATIONS,
        {},
        {
          repeat: {
            pattern: '*/5 * * * *', // Every 5 minutes
          },
          jobId: 'cleanup-orphaned-reservations', // Unique ID prevents duplicates
        },
      );

      this.logger.log(
        'Scheduled orphaned reservations cleanup (every 5 minutes)',
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to schedule orphaned reservations cleanup: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Schedule Redis health check
   * Runs every minute to monitor Redis connectivity
   */
  async scheduleRedisHealthCheck(): Promise<void> {
    try {
      await this.cronQueue.add(
        JOB_NAMES.REDIS_HEALTH_CHECK,
        {},
        {
          repeat: {
            pattern: '* * * * *', // Every minute
          },
          jobId: 'redis-health-check', // Unique ID prevents duplicates
        },
      );

      this.logger.log('Scheduled Redis health check (every minute)');
    } catch (error: any) {
      this.logger.error(
        `Failed to schedule Redis health check: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Initialize all cron jobs
   * Call this on application startup
   */
  async initializeCronJobs(): Promise<void> {
    this.logger.log('Initializing cron jobs...');

    await this.scheduleOrphanedReservationsCleanup();
    await this.scheduleRedisHealthCheck();

    this.logger.log('✅ All cron jobs initialized');
  }

  /**
   * Remove all repeatable jobs (for testing or maintenance)
   */
  async removeAllRepeatableJobs(): Promise<void> {
    const repeatableJobs = await this.cronQueue.getRepeatableJobs();

    for (const job of repeatableJobs) {
      await this.cronQueue.removeRepeatableByKey(job.key);
      this.logger.log(`Removed repeatable job: ${job.name}`);
    }

    this.logger.log('All repeatable jobs removed');
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed, repeatableJobs] =
      await Promise.all([
        this.cronQueue.getWaitingCount(),
        this.cronQueue.getActiveCount(),
        this.cronQueue.getCompletedCount(),
        this.cronQueue.getFailedCount(),
        this.cronQueue.getDelayedCount(),
        this.cronQueue.getRepeatableJobs(),
      ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      repeatableJobsCount: repeatableJobs.length,
      repeatableJobs: repeatableJobs.map((job) => ({
        name: job.name,
        pattern: job.pattern,
        next: job.next,
      })),
    };
  }
}
