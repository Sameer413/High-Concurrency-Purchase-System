import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inventory } from './entities/inventory.entity';
import { Product } from '../product/entities/product.entity';
import { InventoryService } from './inventory.service';
import { ReservationCleanupService } from './reservation-cleanup.service';
import { InventoryController } from './inventory.controller';
import { CleanupModule } from './cleanup/cleanup.module';
import { Reservation } from './entities/reservation.entity';

import { Order } from '../order/entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inventory, Product, Reservation, Order]),
    CleanupModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService, ReservationCleanupService],
  exports: [InventoryService, CleanupModule],
})
export class InventoryModule {}
