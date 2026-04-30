import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './database/redis/redis.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrderModule } from './modules/order/order.module';
import { ProductModule } from './modules/product/product.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { AuthInjectMiddleware } from './common/middleware/auth-inject.middleware';
import { AddressModule } from './modules/address/address.module';
import { FavoriteModule } from './modules/favorite/favorite.module';
import { CartModule } from './modules/cart/cart.module';

@Module({
  imports: [
    // Global config loaded from .env
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // Database
    DatabaseModule,
    RedisModule,

    // Common utilities (ResponseService, etc.)
    CommonModule,

    // Feature modules
    AuthModule,
    UsersModule,
    ProductModule,
    OrderModule,
    InventoryModule,
    AddressModule,
    FavoriteModule,
    CartModule,
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
