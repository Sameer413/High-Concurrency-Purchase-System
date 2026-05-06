import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './database/redis/redis.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrderModule } from './modules/order/order.module';
import { ProductModule } from './modules/product/product.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PaymentModule } from './modules/payment/payment.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { AuthInjectMiddleware } from './common/middleware/auth-inject.middleware';
import { AddressModule } from './modules/address/address.module';
import { FavoriteModule } from './modules/favorite/favorite.module';
import { CartModule } from './modules/cart/cart.module';
import emailConfig from './config/email.config';
import { EmailModule } from './modules/email/email.module';
import { QueueModule } from './modules/queue/queue.module';
import { BullModule } from "@nestjs/bullmq"

@Module({
  imports: [
    // Global config loaded from .env
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration, emailConfig],
      envFilePath: '.env',
    }),

    // Database
    DatabaseModule,
    RedisModule,
    ScheduleModule.forRoot(),

    // Common utilities (ResponseService, etc.)
    CommonModule,

    // BullMQ - must be initialized before modules that use queues
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        connection: {
          host: cfg.get<string>('redis.host'),
          port: cfg.get<number>('redis.port'),
          password: cfg.get<string>('redis.password') || undefined,
          tls: cfg.get<boolean>('redis.tls') ? {
            rejectUnauthorized: true,
          } : undefined,
          maxRetriesPerRequest: null, // Required for BullMQ
          enableReadyCheck: false,
          lazyConnect: false,
          keepAlive: 30000,
          connectTimeout: 10000,
          retryStrategy: (times) => {
            if (times > 10) {
              return null; // Stop retrying after 10 attempts
            }
            return Math.min(times * 100, 3000);
          },
          reconnectOnError: (err) => {
            const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
            return targetErrors.some(targetError => err.message.includes(targetError));
          },
        },
        defaultJobOptions: {
          attempts: 3, // Retry failed jobs 3 times
          backoff: {
            type: 'exponential',
            delay: 2000, // Start with 2 second delay
          },
          removeOnComplete: true, // Clean up completed jobs
          removeOnFail: false, // Keep failed jobs for debugging
        },
      })
    }),

    // Feature modules
    AuthModule,
    UsersModule,
    ProductModule,
    OrderModule,
    InventoryModule,
    PaymentModule,
    AddressModule,
    FavoriteModule,
    CartModule,
    EmailModule, // Simplified email module
    QueueModule, // New queue module for background jobs
  ],
  providers: [
    // ── Global Guards ────────────────────────────────────────────────────────
    // Applied to every route. Public routes escape via @Public() decorator.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },

    // ── Global Filter ────────────────────────────────────────────────────────
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    // ── Global Interceptor ───────────────────────────────────────────────────
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware, AuthInjectMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
