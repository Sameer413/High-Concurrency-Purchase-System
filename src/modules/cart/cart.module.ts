import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';

import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { Product } from '../product/entities/product.entity';
import { ResponseService } from 'src/common/services/response-service';

@Module({
  imports: [TypeOrmModule.forFeature([Cart, CartItem, Product])],
  controllers: [CartController],
  providers: [CartService, ResponseService],
  exports: [CartService],
})
export class CartModule {}
