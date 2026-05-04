import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Payment } from './entities/payment.entity';
import { Order } from '../order/entities/order.entity';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ResponseService } from 'src/common/services/response-service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order]),
    RazorpayModule,
    InventoryModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, ResponseService],
  exports: [PaymentService],
})
export class PaymentModule {}
