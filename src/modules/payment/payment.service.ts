import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Order } from '../order/entities/order.entity';
import { RazorpayService } from '../razorpay/razorpay.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { InventoryService } from '../inventory/inventory.service';
import {
  Reservation,
  ReservationStatus,
} from '../inventory/entities/reservation.entity';
import { OrderService } from '../order/order.service';
import { PaymentQueueService } from '../queue/services/payment-queue.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly razorpayService: RazorpayService,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    private readonly paymentQueueService: PaymentQueueService,
  ) {}

  /**
   * Step 1: Create Razorpay order and payment record
   * Called from frontend before showing Razorpay checkout
   * 
   * @param dto - Payment creation data
   * @param userId - Current user ID
   * @param idempotencyKey - Optional idempotency key from header
   */
  async createPayment(
    dto: CreatePaymentDto,
    userId: string,
    idempotencyKey?: string,
  ) {
    // 0. Check idempotency key first (if provided)
    if (idempotencyKey) {
      const existingByKey = await this.paymentRepo.findOne({
        where: { idempotencyKey },
      });

      if (existingByKey) {
        this.logger.log(
          `Idempotent request detected: ${idempotencyKey}, returning existing payment: ${existingByKey.id}`,
        );

        // Return existing payment response
        return {
          paymentId: existingByKey.id,
          razorpayOrderId: existingByKey.razorpayOrderId,
          amount: existingByKey.amount,
          currency: existingByKey.currency,
          razorpayKeyId: this.razorpayService.getPublicKey(),
          idempotent: true, // Flag to indicate this is a cached response
        };
      }
    }

    // 1. Validate order exists and belongs to user
    const order = await this.orderRepo.findOne({
      where: { id: dto.orderId, userId },
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === 'PAID') {
      throw new ConflictException('Order is already paid');
    }

    if (order.status === 'CANCELLED') {
      throw new ConflictException('Order is cancelled');
    }

    // 2. Check if payment already exists for this order (fallback idempotency)
    const existingPayment = await this.paymentRepo.findOne({
      where: { orderId: dto.orderId, status: PaymentStatus.CREATED },
    });

    if (existingPayment) {
      // Return existing payment if already created
      this.logger.log(
        `Payment already exists for order: ${dto.orderId}, returning existing payment: ${existingPayment.id}`,
      );

      return {
        paymentId: existingPayment.id,
        razorpayOrderId: existingPayment.razorpayOrderId,
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        razorpayKeyId: this.razorpayService.getPublicKey(),
        idempotent: true,
      };
    }

    // 3. Create Razorpay order
    const amountInPaise = Math.round(dto.amount * 100); // Convert to paise

    const razorpayOrder = await this.razorpayService.createOrder({
      amount: amountInPaise,
      currency: dto.currency,
      receipt: order.orderNumber,
      notes: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: order.customerEmail,
        ...(idempotencyKey && { idempotencyKey }),
      },
    });

    // 4. Create payment record in database
    const payment = this.paymentRepo.create({
      orderId: order.id,
      razorpayOrderId: razorpayOrder.id,
      amount: dto.amount,
      currency: dto.currency,
      status: PaymentStatus.CREATED,
      idempotencyKey: idempotencyKey || null, // Store idempotency key
      metadata: {
        notes: dto.notes,
        razorpayOrderData: razorpayOrder,
        ...(idempotencyKey && { idempotencyKey }),
      },
    });

    await this.paymentRepo.save(payment);

    this.logger.log(
      `Payment created: ${payment.id} for order ${order.orderNumber}${idempotencyKey ? ` with idempotency key: ${idempotencyKey}` : ''}`,
    );

    return {
      paymentId: payment.id,
      razorpayOrderId: razorpayOrder.id,
      amount: dto.amount,
      currency: dto.currency,
      razorpayKeyId: this.razorpayService.getPublicKey(),
      idempotent: false, // New payment created
    };
  }

  /**
   * Step 2: Verify payment signature and complete order
   * Called from frontend after Razorpay payment success
   */
  async verifyPayment(dto: VerifyPaymentDto, userId: string) {
    return await this.dataSource.transaction(async (manager) => {
      // 1. Find order and payment
      const order = await manager.findOne(Order, {
        where: { id: dto.orderId, userId },
        relations: ['items'],
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const payment = await manager.findOne(Payment, {
        where: {
          orderId: dto.orderId,
          razorpayOrderId: dto.razorpay_order_id,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      // Check if already processed (Idempotency and Race condition protection)
      if (payment.status === PaymentStatus.CAPTURED) {
        this.logger.log(`Payment already captured, skipping verification: ${payment.id}`);
        return {
          success: true,
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentId: payment.id,
          status: order.status,
          paidAt: order.paidAt,
        };
      }

      // 2. Verify signature
      const isValid = await this.razorpayService.verifyPaymentSignature({
        razorpay_order_id: dto.razorpay_order_id,
        razorpay_payment_id: dto.razorpay_payment_id,
        razorpay_signature: dto.razorpay_signature,
      });

      if (!isValid) {
        // Update payment status to failed
        payment.status = PaymentStatus.FAILED;
        payment.metadata = {
          ...payment.metadata,
          error: 'Invalid signature',
          failedAt: new Date().toISOString(),
        };
        await manager.save(payment);

        // Immediately release reserved stock
        await this.releaseStockForFailedPayment(order);

        // Send payment failed email (async, don't wait)
        this.orderService.sendPaymentFailedEmail(order, 'Invalid signature').catch((err) => {
          this.logger.error(`Failed to send payment failed email for order ${order.orderNumber}:`, err);
        });

        throw new BadRequestException('Invalid payment signature');
      }

      // 3. Update payment record
      payment.razorpayPaymentId = dto.razorpay_payment_id;
      payment.razorpaySignature = dto.razorpay_signature;
      payment.status = PaymentStatus.CAPTURED;
      payment.metadata = {
        ...payment.metadata,
        capturedAt: new Date().toISOString(),
      };
      await manager.save(payment);

      // 4. Update order status
      order.status = 'PAID';
      order.paidAt = new Date();
      await manager.save(order);

      // 5. Convert reserved stock to sold stock
      const reservationRepo = manager.getRepository(Reservation);
      const reservation = await reservationRepo.findOne({
        where: { id: order.reservationId },
      });

      if (reservation) {
        try {
          // Get all product IDs from order items
          for (const item of order.items) {
            await this.inventoryService.confirmSaleTx(
              manager,
              item.productId,
              item.quantity,
            );
          }

          // Mark reservation as completed
          reservation.status = ReservationStatus.COMPLETED;
          await reservationRepo.save(reservation);
        } catch (error) {
          if (error instanceof BadRequestException) {
            // Stock was released or unavailable (Late Payment Edge Case)
            this.logger.error(`Stock unavailable for late payment (Order: ${order.orderNumber}). Needs refund.`);
            order.status = 'NEEDS_REFUND';
            await manager.save(order);
          } else {
            throw error;
          }
        }
      }

      this.logger.log(
        `Payment verified and order completed: ${order.orderNumber}`,
      );

      // Send payment success email (async, don't wait)
      if (order.status === 'PAID') {
        this.orderService.sendPaymentSuccessEmail(order).catch((err) => {
          this.logger.error(`Failed to send payment success email for order ${order.orderNumber}:`, err);
        });
      }

      return {
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentId: payment.id,
        status: order.status,
        paidAt: order.paidAt,
      };
    });
  }

  /**
   * Get payment details by ID
   */
  async getPayment(paymentId: string, userId: string) {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['order'],
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Verify ownership
    if (payment.order.userId !== userId) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  /**
   * Get all payments for an order
   */
  async getOrderPayments(orderId: string, userId: string) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, userId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.paymentRepo.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Handle payment failure
   */
  async handlePaymentFailure(
    orderId: string,
    razorpayOrderId: string,
    reason: string,
  ) {
    const payment = await this.paymentRepo.findOne({
      where: { orderId, razorpayOrderId },
      relations: ['order', 'order.items'],
    });

    if (payment) {
      if (payment.status === PaymentStatus.CAPTURED) {
        this.logger.log(`Ignoring failure for already captured payment: ${payment.id}`);
        return;
      }

      payment.status = PaymentStatus.FAILED;
      payment.metadata = {
        ...payment.metadata,
        error: reason,
        failedAt: new Date().toISOString(),
      };
      await this.paymentRepo.save(payment);

      // Immediately release reserved stock
      if (payment.order) {
        await this.releaseStockForFailedPayment(payment.order);
        
        // Send payment failed email (async, don't wait)
        this.orderService.sendPaymentFailedEmail(payment.order, reason).catch((err) => {
          this.logger.error(`Failed to send payment failed email for order ${payment.order.orderNumber}:`, err);
        });
      }

      this.logger.warn(`Payment failed: ${payment.id} - ${reason}`);
    }
  }

  /**
   * Webhook Handler: Payment Authorized
   * Called when payment is authorized but not yet captured
   */
  async handlePaymentAuthorized(paymentEntity: any) {
    this.logger.log(
      `Webhook: Payment authorized - ${paymentEntity.id} for order ${paymentEntity.order_id}`,
    );

    const payment = await this.paymentRepo.findOne({
      where: { razorpayOrderId: paymentEntity.order_id },
    });

    if (!payment) {
      this.logger.warn(
        `Payment not found for Razorpay order: ${paymentEntity.order_id}`,
      );
      return;
    }

    // Update payment with authorization details
    payment.razorpayPaymentId = paymentEntity.id;
    payment.status = PaymentStatus.PENDING;
    payment.method = paymentEntity.method;
    payment.metadata = {
      ...payment.metadata,
      authorizedAt: new Date().toISOString(),
      webhookData: {
        event: 'payment.authorized',
        amount: paymentEntity.amount,
        currency: paymentEntity.currency,
        method: paymentEntity.method,
        email: paymentEntity.email,
        contact: paymentEntity.contact,
      },
    };

    await this.paymentRepo.save(payment);

    this.logger.log(`Payment authorized and updated: ${payment.id}`);
  }

  /**
   * Webhook Handler: Payment Captured
   * Called when payment is successfully captured
   * This is the final success state
   */
  async handlePaymentCaptured(paymentEntity: any) {
    this.logger.log(
      `Webhook: Payment captured - ${paymentEntity.id} for order ${paymentEntity.order_id}`,
    );

    let orderData: {
      id: string;
      orderNumber: string;
      reservationId: string;
      items: Array<{ productId: string; quantity: number }>;
    } | null = null;

    await this.dataSource.transaction(async (manager) => {
      // Find payment
      const payment = await manager.findOne(Payment, {
        where: { razorpayOrderId: paymentEntity.order_id },
        relations: ['order', 'order.items'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!payment) {
        this.logger.warn(
          `Payment not found for Razorpay order: ${paymentEntity.order_id}`,
        );
        return;
      }

      // Check if already processed
      if (payment.status === PaymentStatus.CAPTURED) {
        this.logger.log(
          `Payment already captured, skipping: ${payment.id}`,
        );
        return;
      }

      // Update payment
      payment.razorpayPaymentId = paymentEntity.id;
      payment.status = PaymentStatus.CAPTURED;
      payment.method = paymentEntity.method;
      payment.metadata = {
        ...payment.metadata,
        capturedAt: new Date().toISOString(),
        webhookData: {
          event: 'payment.captured',
          amount: paymentEntity.amount,
          currency: paymentEntity.currency,
          method: paymentEntity.method,
          email: paymentEntity.email,
          contact: paymentEntity.contact,
          fee: paymentEntity.fee,
          tax: paymentEntity.tax,
        },
      };
      await manager.save(payment);

      // Update order status if not already paid
      const order = payment.order;
      if (order.status !== 'PAID') {
        order.status = 'PAID';
        order.paidAt = new Date();
        await manager.save(order);
      }

      this.logger.log(
        `Payment captured and order updated via webhook: ${order.orderNumber}`,
      );

      // Store order data for queueing after transaction
      if (order.status === 'PAID') {
        orderData = {
          id: order.id,
          orderNumber: order.orderNumber,
          reservationId: order.reservationId,
          items: order.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        };
      }

      // Send payment success email (async, don't wait)
      if (order.status === 'PAID') {
        this.orderService.sendPaymentSuccessEmail(order).catch((err) => {
          this.logger.error(`Failed to send payment success email for order ${order.orderNumber}:`, err);
        });
      }
    });

    // After transaction commits, queue stock conversion (async)
    if (orderData) {
      const { id, orderNumber, reservationId, items } = orderData;
      
      try {
        // Queue stock conversion job
        await this.paymentQueueService.queueStockConversion({
          orderId: id,
          orderNumber: orderNumber,
          reservationId: reservationId,
          items: items,
        }).catch((err) => {
          this.logger.error(`Failed to queue stock conversion for order ${orderNumber}:`, err);
        });

        // Queue reservation completion job
        await this.paymentQueueService.queueReservationCompletion({
          orderId: id,
          orderNumber: orderNumber,
          reservationId: reservationId,
        }).catch((err) => {
          this.logger.error(`Failed to queue reservation completion for order ${orderNumber}:`, err);
        });
      } catch (error: any) {
        this.logger.error(`Failed to queue payment processing jobs: ${error.message}`);
      }
    }
  }

  /**
   * Webhook Handler: Payment Failed
   * Called when payment fails
   */
  async handlePaymentFailedWebhook(paymentEntity: any) {
    this.logger.warn(
      `Webhook: Payment failed - ${paymentEntity.id} for order ${paymentEntity.order_id}`,
    );

    const payment = await this.paymentRepo.findOne({
      where: { razorpayOrderId: paymentEntity.order_id },
      relations: ['order', 'order.items'],
    });

    if (!payment) {
      this.logger.warn(
        `Payment not found for Razorpay order: ${paymentEntity.order_id}`,
      );
      return;
    }

    if (payment.status === PaymentStatus.CAPTURED) {
      this.logger.log(`Ignoring failure webhook for already captured payment: ${payment.id}`);
      return;
    }

    // Update payment with failure details
    payment.razorpayPaymentId = paymentEntity.id;
    payment.status = PaymentStatus.FAILED;
    payment.method = paymentEntity.method;
    payment.metadata = {
      ...payment.metadata,
      failedAt: new Date().toISOString(),
      webhookData: {
        event: 'payment.failed',
        error_code: paymentEntity.error_code,
        error_description: paymentEntity.error_description,
        error_source: paymentEntity.error_source,
        error_step: paymentEntity.error_step,
        error_reason: paymentEntity.error_reason,
      },
    };

    await this.paymentRepo.save(payment);

    // Immediately release reserved stock
    if (payment.order) {
      await this.releaseStockForFailedPayment(payment.order);
      
      // Send payment failed email (async, don't wait)
      const errorDescription = paymentEntity.error_description || 'Payment failed';
      this.orderService.sendPaymentFailedEmail(payment.order, errorDescription).catch((err) => {
        this.logger.error(`Failed to send payment failed email for order ${payment.order.orderNumber}:`, err);
      });
    }

    this.logger.warn(
      `Payment failed and updated: ${payment.id} - ${paymentEntity.error_description}`,
    );
  }

  /**
   * Webhook Handler: Order Paid
   * Called when an order is marked as paid
   */
  async handleOrderPaid(orderEntity: any) {
    this.logger.log(`Webhook: Order paid - ${orderEntity.id}`);

    const payment = await this.paymentRepo.findOne({
      where: { razorpayOrderId: orderEntity.id },
      relations: ['order'],
    });

    if (!payment) {
      this.logger.warn(
        `Payment not found for Razorpay order: ${orderEntity.id}`,
      );
      return;
    }

    // Update metadata with order paid event
    payment.metadata = {
      ...payment.metadata,
      orderPaidAt: new Date().toISOString(),
      orderPaidWebhook: {
        amount_paid: orderEntity.amount_paid,
        amount_due: orderEntity.amount_due,
        attempts: orderEntity.attempts,
      },
    };

    await this.paymentRepo.save(payment);

    this.logger.log(`Order paid webhook processed: ${payment.id}`);
  }

  /**
   * Helper: Release stock for failed payment
   */
  private async releaseStockForFailedPayment(order: Order) {
    if (!order.items || order.items.length === 0) {
      return;
    }

    try {
      const reservationRepo = this.dataSource.getRepository(Reservation);
      const reservation = await reservationRepo.findOne({
        where: { id: order.reservationId },
      });

      // Only release if the reservation is still active
      if (reservation && reservation.status === ReservationStatus.ACTIVE) {
        // Release inventory for each item
        for (const item of order.items) {
          await this.inventoryService.releaseReservation(
            item.productId,
            item.quantity,
          );
        }

        // Update reservation status to EXPIRED/FAILED
        reservation.status = ReservationStatus.EXPIRED;
        await reservationRepo.save(reservation);

        // Update order status to CANCELLED
        order.status = 'CANCELLED';
        await this.orderRepo.save(order);

        this.logger.log(`Successfully released stock and cancelled order for failed payment (Order: ${order.orderNumber})`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to release stock for failed payment (Order: ${order.orderNumber}): ${error.message}`);
    }
  }
}
