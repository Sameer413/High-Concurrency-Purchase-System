import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CleanupService } from './cleanup.service';

@Injectable()
export class CleanupJob implements OnModuleInit {
  private readonly logger = new Logger(CleanupJob.name);
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly cleanupService: CleanupService) {}

  /**
   * Start the cleanup job when the module initializes
   */
  async onModuleInit() {
    this.logger.log('Starting cleanup job...');
    await this.startCleanupJob();
  }

  /**
   * Stop the cleanup job when the module destroys
   */
  async onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.logger.log('Cleanup job stopped');
    }
  }

  /**
   * Run cleanup every 5 minutes
   * This releases any expired stock reservations
   */
  private async startCleanupJob() {
    // Run immediately on startup
    await this.handleCleanup();

    // Then run every 5 minutes
    this.cleanupInterval = setInterval(async () => {
      await this.handleCleanup();
    }, 5 * 60 * 1000); // 5 minutes
  }

  private async handleCleanup() {
    this.logger.log('Running scheduled cleanup job...');
    await this.cleanupService.releaseExpiredReservations();
  }
}
