import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QUEUE_NAMES, QUEUE_CONFIG } from './constants/queue.constants';

// Entities
import { Order } from '../order/entities/order.entity';
import { Reservation } from '../inventory/entities/reservation.entity';
import { Payment } from '../payment/entities/payment.entity';
import { PaymentRefund } from '../payment/entities/payment-refund.entity';

// Processors
import { EmailProcessor } from './processors/email.processor';
import { PaymentProcessor } from './processors/payment.processor';
import { InventoryProcessor } from './processors/inventory.processor';
import { CronProcessor } from './processors/cron.processor';
import { RefundProcessor } from './processors/refund.processor';

// Services
import { EmailQueueService } from './services/email-queue.service';
import { PaymentQueueService } from './services/payment-queue.service';
import { InventoryQueueService } from './services/inventory-queue.service';
import { CronQueueService } from './services/cron-queue.service';
import { RefundQueueService } from './services/refund-queue.service';
import { EmailModule } from '../email/email.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { RedisModule } from 'src/database/redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Order, Reservation, Payment, PaymentRefund]), // Import entities for processors

    // Register BullMQ with Redis connection
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),

    // Register Email Notifications Queue
    BullModule.registerQueue({
      name: QUEUE_NAMES.EMAIL_NOTIFICATIONS,
      defaultJobOptions: QUEUE_CONFIG.EMAIL_NOTIFICATIONS.defaultJobOptions,
    }),

    // Register Payment Processing Queue
    BullModule.registerQueue({
      name: QUEUE_NAMES.PAYMENT_PROCESSING,
      defaultJobOptions: QUEUE_CONFIG.PAYMENT_PROCESSING.defaultJobOptions,
    }),

    // Register Inventory Cleanup Queue
    BullModule.registerQueue({
      name: QUEUE_NAMES.INVENTORY_CLEANUP,
      defaultJobOptions: QUEUE_CONFIG.INVENTORY_CLEANUP.defaultJobOptions,
    }),

    // Register Cron Jobs Queue
    BullModule.registerQueue({
      name: QUEUE_NAMES.CRON_JOBS,
      defaultJobOptions: QUEUE_CONFIG.CRON_JOBS.defaultJobOptions,
    }),

    // Register Refund Processing Queue
    BullModule.registerQueue({
      name: QUEUE_NAMES.REFUND_PROCESSING,
      defaultJobOptions: QUEUE_CONFIG.REFUND_PROCESSING.defaultJobOptions,
    }),

    // Import modules for processors
    EmailModule,
    InventoryModule,
    RazorpayModule,
    RedisModule,
  ],
  providers: [
    EmailProcessor,
    PaymentProcessor,
    InventoryProcessor,
    CronProcessor,
    RefundProcessor,
    EmailQueueService,
    PaymentQueueService,
    InventoryQueueService,
    CronQueueService,
    RefundQueueService,
  ],
  exports: [
    EmailQueueService, // Export for use in other modules
    PaymentQueueService, // Export for use in payment module
    InventoryQueueService, // Export for use in inventory module
    CronQueueService, // Export for use in app module
    RefundQueueService, // Export for use in payment module
    BullModule, // Export BullModule if other modules need direct queue access
  ],
})
export class QueueModule {}
