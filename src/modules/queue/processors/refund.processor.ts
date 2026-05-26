import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order } from '../../order/entities/order.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { PaymentRefund, RefundStatus } from '../../payment/entities/payment-refund.entity';
import { RazorpayService } from '../../razorpay/razorpay.service';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queue.constants';
import {
  InitiateRefundJobDto,
  CheckRefundStatusJobDto,
} from '../dto/refund-job.dto';
import { EmailQueueService } from '../services/email-queue.service';
import { InjectQueue } from '@nestjs/bullmq';

/**
 * Refund Queue Processor
 * Handles all refund-related background jobs
 */
@Processor(QUEUE_NAMES.REFUND_PROCESSING)
export class RefundProcessor extends WorkerHost {
  private readonly logger = new Logger(RefundProcessor.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PaymentRefund)
    private readonly refundRepo: Repository<PaymentRefund>,
    private readonly razorpayService: RazorpayService,
    private readonly dataSource: DataSource,
    private readonly emailQueueService: EmailQueueService,
    @InjectQueue(QUEUE_NAMES.REFUND_PROCESSING)
    private readonly refundQueue: Queue,
  ) {
    super();
  }

  /**
   * Main process method - routes jobs to appropriate handlers
   */
  async process(job: Job): Promise<any> {
    this.logger.log(`Processing job ${job.name} with ID ${job.id}`);

    try {
      switch (job.name) {
        case JOB_NAMES.INITIATE_REFUND:
          return await this.handleInitiateRefund(job);

        case JOB_NAMES.CHECK_REFUND_STATUS:
          return await this.handleCheckRefundStatus(job);

        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
          throw new Error(`Unknown job name: ${job.name}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to process job ${job.name} (ID: ${job.id}): ${error.message}`,
        error.stack,
      );
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Handle Refund Initiation
   * Creates a refund request with Razorpay
   */
  private async handleInitiateRefund(
    job: Job<InitiateRefundJobDto>,
  ): Promise<void> {
    const {
      orderId,
      orderNumber,
      paymentId,
      razorpayPaymentId,
      amount,
      currency,
      reason,
    } = job.data;

    this.logger.log(
      `Initiating refund for order ${orderNumber} (${orderId}), amount: ${amount} ${currency}`,
    );

    return await this.dataSource.transaction(async (manager) => {
      // 1. Verify order and payment exist
      const order = await manager.findOne(Order, {
        where: { id: orderId },
      });

      if (!order) {
        this.logger.error(`Order not found: ${orderId}`);
        throw new Error(`Order not found: ${orderId}`);
      }

      const payment = await manager.findOne(Payment, {
        where: { id: paymentId },
      });

      if (!payment) {
        this.logger.error(`Payment not found: ${paymentId}`);
        throw new Error(`Payment not found: ${paymentId}`);
      }

      // 2. Check if refund already exists (idempotency)
      const existingRefund = await manager.findOne(PaymentRefund, {
        where: { paymentId },
      });

      if (existingRefund) {
        this.logger.log(
          `Refund already exists for payment ${paymentId}: ${existingRefund.id} (status: ${existingRefund.refundStatus})`,
        );

        // If refund is pending or processing, don't create a new one
        if (
          existingRefund.refundStatus === RefundStatus.PENDING ||
          existingRefund.refundStatus === RefundStatus.PROCESSING
        ) {
          this.logger.log(
            `Refund ${existingRefund.id} is already in progress, skipping`,
          );
          return;
        }

        // If refund failed, we can retry
        if (existingRefund.refundStatus === RefundStatus.FAILED) {
          this.logger.log(
            `Previous refund ${existingRefund.id} failed, retrying...`,
          );
        } else if (existingRefund.refundStatus === RefundStatus.COMPLETED) {
          this.logger.log(
            `Refund ${existingRefund.id} already completed, skipping`,
          );
          return;
        }
      }

      try {
        // 3. Create refund with Razorpay
        const amountInPaise = Math.round(amount * 100); // Convert to paise

        this.logger.log(
          `Creating Razorpay refund for payment ${razorpayPaymentId}, amount: ${amountInPaise} paise`,
        );

        const razorpayRefund = await this.razorpayService.createRefund(
          razorpayPaymentId,
          {
            amount: amountInPaise,
            notes: {
              orderId,
              orderNumber,
              reason,
            },
          },
        );

        this.logger.log(
          `Razorpay refund created: ${razorpayRefund.id}, status: ${razorpayRefund.status}`,
        );

        // 4. Create or update refund record in database
        let refund: PaymentRefund;

        if (existingRefund) {
          // Update existing refund
          existingRefund.razorpayRefundId = razorpayRefund.id;
          existingRefund.refundAmount = amount;
          existingRefund.currency = currency;
          existingRefund.refundStatus = this.mapRazorpayRefundStatus(
            razorpayRefund.status,
          );
          existingRefund.refundReason = reason;
          existingRefund.metadata = {
            ...existingRefund.metadata,
            razorpayRefundData: razorpayRefund,
            retriedAt: new Date().toISOString(),
          };

          refund = await manager.save(existingRefund);
        } else {
          // Create new refund
          refund = manager.create(PaymentRefund, {
            orderId,
            paymentId,
            razorpayRefundId: razorpayRefund.id,
            refundAmount: amount,
            currency,
            refundStatus: this.mapRazorpayRefundStatus(razorpayRefund.status),
            refundReason: reason,
            metadata: {
              razorpayRefundData: razorpayRefund,
              initiatedAt: new Date().toISOString(),
            },
          });

          refund = await manager.save(refund);
        }

        this.logger.log(
          `Refund record created/updated: ${refund.id}, status: ${refund.refundStatus}`,
        );

        // 5. Update order status
        if (order.status === 'NEEDS_REFUND') {
          order.status = 'REFUND_INITIATED';
          await manager.save(order);
        }

        // 6. Send refund initiated email (async, don't wait)
        this.emailQueueService
          .queueRefundInitiated({
            orderId: order.id,
            refundId: refund.id,
          })
          .catch((err) => {
            this.logger.error(
              `Failed to queue refund initiated email for order ${orderNumber}:`,
              err,
            );
          });

        // 7. If refund is not immediately completed, schedule status check
        if (
          refund.refundStatus === RefundStatus.PENDING ||
          refund.refundStatus === RefundStatus.PROCESSING
        ) {
          // Schedule first status check after 30 seconds
          await this.scheduleRefundStatusCheck(
            orderId,
            orderNumber,
            refund.id,
            razorpayRefund.id,
            1,
            30000, // 30 seconds
          );
        } else if (refund.refundStatus === RefundStatus.COMPLETED) {
          // Refund completed immediately
          await this.handleRefundCompleted(manager, order, refund);
        }

        this.logger.log(
          `Successfully initiated refund for order ${orderNumber}`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to create Razorpay refund for order ${orderNumber}: ${error.message}`,
          error.stack,
        );

        // Create failed refund record
        const failedRefund = manager.create(PaymentRefund, {
          orderId,
          paymentId,
          refundAmount: amount,
          currency,
          refundStatus: RefundStatus.FAILED,
          refundReason: reason,
          metadata: {
            error: error.message,
            failedAt: new Date().toISOString(),
          },
        });

        await manager.save(failedRefund);

        throw error;
      }
    });
  }

  /**
   * Handle Refund Status Check
   * Polls Razorpay for refund status updates
   */
  private async handleCheckRefundStatus(
    job: Job<CheckRefundStatusJobDto>,
  ): Promise<void> {
    const { orderId, orderNumber, refundId, razorpayRefundId, attemptNumber } =
      job.data;

    this.logger.log(
      `Checking refund status for order ${orderNumber}, attempt ${attemptNumber}`,
    );

    return await this.dataSource.transaction(async (manager) => {
      // 1. Find refund
      const refund = await manager.findOne(PaymentRefund, {
        where: { id: refundId },
      });

      if (!refund) {
        this.logger.error(`Refund not found: ${refundId}`);
        throw new Error(`Refund not found: ${refundId}`);
      }

      // 2. Check if already completed or failed
      if (
        refund.refundStatus === RefundStatus.COMPLETED ||
        refund.refundStatus === RefundStatus.FAILED
      ) {
        this.logger.log(
          `Refund ${refundId} already in final state: ${refund.refundStatus}`,
        );
        return;
      }

      try {
        // 3. Fetch refund status from Razorpay
        const razorpayRefund =
          await this.razorpayService.fetchRefund(razorpayRefundId);

        this.logger.log(
          `Razorpay refund status: ${razorpayRefund.status} for refund ${razorpayRefundId}`,
        );

        // 4. Update refund status
        const newStatus = this.mapRazorpayRefundStatus(razorpayRefund.status);
        const statusChanged = refund.refundStatus !== newStatus;

        refund.refundStatus = newStatus;
        refund.metadata = {
          ...refund.metadata,
          razorpayRefundData: razorpayRefund,
          lastCheckedAt: new Date().toISOString(),
          attemptNumber,
        };

        await manager.save(refund);

        if (statusChanged) {
          this.logger.log(
            `Refund ${refundId} status updated to: ${newStatus}`,
          );
        }

        // 5. Handle completed refund
        if (refund.refundStatus === RefundStatus.COMPLETED) {
          const order = await manager.findOne(Order, {
            where: { id: orderId },
          });

          if (order) {
            await this.handleRefundCompleted(manager, order, refund);
          }
        }
        // 6. Handle failed refund
        else if (refund.refundStatus === RefundStatus.FAILED) {
          this.logger.error(
            `Refund ${refundId} failed for order ${orderNumber}`,
          );
          // TODO: Send alert to admin for manual intervention
        }
        // 7. Schedule next check if still pending/processing
        else if (
          refund.refundStatus === RefundStatus.PENDING ||
          refund.refundStatus === RefundStatus.PROCESSING
        ) {
          // Max 10 attempts over ~30 minutes
          if (attemptNumber < 10) {
            // Exponential backoff: 30s, 1m, 2m, 4m, 8m, etc.
            const delay = Math.min(30000 * Math.pow(2, attemptNumber), 300000); // Max 5 minutes

            await this.scheduleRefundStatusCheck(
              orderId,
              orderNumber,
              refundId,
              razorpayRefundId,
              attemptNumber + 1,
              delay,
            );

            this.logger.log(
              `Scheduled next refund status check in ${delay / 1000}s (attempt ${attemptNumber + 1})`,
            );
          } else {
            this.logger.warn(
              `Max refund status check attempts reached for refund ${refundId}`,
            );
            // TODO: Send alert to admin for manual check
          }
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to check refund status for ${refundId}: ${error.message}`,
          error.stack,
        );
        throw error;
      }
    });
  }

  /**
   * Handle completed refund
   */
  private async handleRefundCompleted(
    manager: any,
    order: Order,
    refund: PaymentRefund,
  ): Promise<void> {
    this.logger.log(
      `Refund completed for order ${order.orderNumber}: ${refund.id}`,
    );

    // Update order status
    order.status = 'REFUNDED';
    order.refundedAt = new Date();
    await manager.save(order);

    // Send refund completed email (async, don't wait)
    this.emailQueueService
      .queueRefundCompleted({
        orderId: order.id,
        refundId: refund.id,
      })
      .catch((err) => {
        this.logger.error(
          `Failed to queue refund completed email for order ${order.orderNumber}:`,
          err,
        );
      });
  }

  /**
   * Schedule refund status check
   */
  private async scheduleRefundStatusCheck(
    orderId: string,
    orderNumber: string,
    refundId: string,
    razorpayRefundId: string,
    attemptNumber: number,
    delay: number,
  ): Promise<void> {
    try {
      await this.refundQueue.add(
        JOB_NAMES.CHECK_REFUND_STATUS,
        {
          orderId,
          orderNumber,
          refundId,
          razorpayRefundId,
          attemptNumber,
        } as CheckRefundStatusJobDto,
        {
          delay,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          jobId: `refund-status-${refundId}-${attemptNumber}`,
        },
      );

      this.logger.log(
        `Scheduled refund status check for ${refundId} in ${delay / 1000}s (attempt ${attemptNumber})`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to schedule refund status check for ${refundId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Map Razorpay refund status to our RefundStatus enum
   */
  private mapRazorpayRefundStatus(razorpayStatus: string): RefundStatus {
    switch (razorpayStatus) {
      case 'pending':
        return RefundStatus.PENDING;
      case 'processing':
        return RefundStatus.PROCESSING;
      case 'processed':
        return RefundStatus.COMPLETED;
      case 'failed':
        return RefundStatus.FAILED;
      default:
        this.logger.warn(`Unknown Razorpay refund status: ${razorpayStatus}`);
        return RefundStatus.PENDING;
    }
  }
}
