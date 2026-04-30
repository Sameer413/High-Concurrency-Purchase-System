import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inventory } from './entities/inventory.entity';
import { Product } from '../product/entities/product.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { CleanupModule } from './cleanup/cleanup.module';
import { Reservation } from './entities/reservation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inventory, Product, Reservation]),
    CleanupModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService, CleanupModule],
})
export class InventoryModule {}
