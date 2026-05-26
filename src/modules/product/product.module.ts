import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { CommonModule } from 'src/common/common.module';
import { InventoryModule } from '../inventory/inventory.module';
import { QueueModule } from '../queue/queue.module';
import { Reservation } from '../inventory/entities/reservation.entity';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Reservation]),
    CommonModule,
    InventoryModule,
    QueueModule, // Import QueueModule for InventoryQueueService
    S3Module, // Import S3Module for image uploads
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService, TypeOrmModule],
})
export class ProductModule {}
