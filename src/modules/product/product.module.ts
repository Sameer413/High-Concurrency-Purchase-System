import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { CommonModule } from 'src/common/common.module';
import { InventoryModule } from '../inventory/inventory.module';
import { Reservation } from '../inventory/entities/reservation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Reservation]),
    CommonModule,
    InventoryModule,
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService, TypeOrmModule],
})
export class ProductModule {}
