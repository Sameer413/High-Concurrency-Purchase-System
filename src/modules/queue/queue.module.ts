import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QUEUE_NAMES, QUEUE_CONFIG } from './constants/queue.constants';

// Entities
import { Order } from '../order/entities/order.entity';
import { Reservation } from '../inventory/entities/reservation.entity';

// Processors
import { EmailProcessor } from './processors/email.processor';
import { PaymentProcessor } from './processors/payment.processor';

// Services
import { EmailQueueService } from './services/email-queue.service';
import { PaymentQueueService } from './services/payment-queue.service';
import { EmailModule } from '../email/email.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Order, Reservation]), // Import entities for processors

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

    // Import modules for processors
    EmailModule,
    InventoryModule,
  ],
  providers: [
    EmailProcessor,
    PaymentProcessor,
    EmailQueueService,
    PaymentQueueService,
  ],
  exports: [
    EmailQueueService, // Export for use in other modules
    PaymentQueueService, // Export for use in payment module
    BullModule, // Export BullModule if other modules need direct queue access
  ],
})
export class QueueModule {}
