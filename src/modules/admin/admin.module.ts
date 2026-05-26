import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Product } from '../product/entities/product.entity';
import { Order } from '../order/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { S3Module } from '../s3/s3.module';
import { ProductModule } from '../product/product.module';
import { CommonModule } from 'src/common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Order, User]),
    S3Module,
    ProductModule,
    CommonModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
