import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Payment } from './entities/payment.entity';
import { Order } from '../order/entities/order.entity';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ResponseService } from 'src/common/services/response-service';
import { OrderModule } from '../order/order.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order]),
    RazorpayModule,
    InventoryModule,
    QueueModule, // Import QueueModule for PaymentQueueService
    forwardRef(() => OrderModule), // Use forwardRef to avoid circular dependency
  ],
  controllers: [PaymentController],
  providers: [PaymentService, ResponseService],
  exports: [PaymentService],
})
export class PaymentModule {}
