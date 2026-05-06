import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { Order } from '../../order/entities/order.entity';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/queue.constants';
import {
  OrderConfirmationEmailDto,
  PaymentSuccessEmailDto,
  PaymentFailedEmailDto,
} from '../dto/email-job.dto';

/**
 * Email Queue Processor
 * Handles all email-related background jobs
 */
@Processor(QUEUE_NAMES.EMAIL_NOTIFICATIONS)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly emailService: EmailService,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
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
        case JOB_NAMES.SEND_ORDER_CONFIRMATION:
          return await this.handleOrderConfirmation(job);

        case JOB_NAMES.SEND_PAYMENT_SUCCESS:
          return await this.handlePaymentSuccess(job);

        case JOB_NAMES.SEND_PAYMENT_FAILED:
          return await this.handlePaymentFailed(job);

        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
          throw new Error(`Unknown job name: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process job ${job.name} (ID: ${job.id}): ${error.message}`,
        error.stack,
      );
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Handle Order Confirmation Email
   */
  private async handleOrderConfirmation(
    job: Job<OrderConfirmationEmailDto>,
  ): Promise<void> {
    const { orderId } = job.data;

    this.logger.log(`Fetching order details for order confirmation: ${orderId}`);

    // Fetch order with items
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['items'],
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderId}`);
      throw new Error(`Order not found: ${orderId}`);
    }

    this.logger.log(`Sending order confirmation email for order ${order.orderNumber}`);

    const itemsHtml = order.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            ${item.productName}
            ${item.selectedSize ? `<br><small>Size: ${item.selectedSize}</small>` : ''}
            ${item.selectedColor ? `<br><small>Color: ${item.selectedColor}</small>` : ''}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
            ${item.quantity}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
            ₹${Number(item.unitPrice || 0).toFixed(2)}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
            ₹${Number(item.totalPrice || 0).toFixed(2)}
          </td>
        </tr>
      `,
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
          <h1 style="color: #2c3e50; margin: 0;">Order Confirmation</h1>
        </div>
        
        <p>Thank you for your order! We've received your order and will process it shortly.</p>
        
        <div style="background-color: #fff; border: 1px solid #dee2e6; border-radius: 5px; padding: 15px; margin: 20px 0;">
          <h2 style="color: #495057; font-size: 18px; margin-top: 0;">Order Details</h2>
          <p style="margin: 5px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
          <p style="margin: 5px 0;"><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
          <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #ffc107; font-weight: bold;">${order.status}</span></p>
        </div>

        <h2 style="color: #495057; font-size: 18px;">Order Items</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Product</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Qty</th>
              <th style="padding: 10px; text-align: right; border-bottom: 2px solid #dee2e6;">Price</th>
              <th style="padding: 10px; text-align: right; border-bottom: 2px solid #dee2e6;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding: 15px 10px; text-align: right; font-weight: bold; font-size: 18px;">
                Total Amount:
              </td>
              <td style="padding: 15px 10px; text-align: right; font-weight: bold; font-size: 18px; color: #28a745;">
                ₹${Number(order.totalAmount).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div style="background-color: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Next Steps:</strong></p>
          <p style="margin: 5px 0 0 0;">Please complete the payment to confirm your order. You will receive another email once payment is confirmed.</p>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 14px;">
          <p>If you have any questions, please contact our support team.</p>
          <p style="margin: 5px 0;">Thank you for shopping with us!</p>
        </div>
      </body>
      </html>
    `;

    await this.emailService.sendMail(
      order.customerEmail,
      `Order Confirmation - ${order.orderNumber}`,
      html,
    );

    this.logger.log(`Order confirmation email sent successfully for order ${order.orderNumber}`);
  }

  /**
   * Handle Payment Success Email
   */
  private async handlePaymentSuccess(
    job: Job<PaymentSuccessEmailDto>,
  ): Promise<void> {
    const { orderId } = job.data;

    this.logger.log(`Fetching order details for payment success: ${orderId}`);

    // Fetch order with items
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['items'],
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderId}`);
      throw new Error(`Order not found: ${orderId}`);
    }

    this.logger.log(`Sending payment success email for order ${order.orderNumber}`);

    const itemsHtml = order.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            ${item.productName}
            ${item.selectedSize ? `<br><small>Size: ${item.selectedSize}</small>` : ''}
            ${item.selectedColor ? `<br><small>Color: ${item.selectedColor}</small>` : ''}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
            ${item.quantity}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
            ₹${Number(item.unitPrice).toFixed(2)}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
            ₹${Number(item.totalPrice).toFixed(2)}
          </td>
        </tr>
      `,
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Successful</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #d4edda; padding: 20px; border-radius: 5px; margin-bottom: 20px; border: 1px solid #c3e6cb;">
          <h1 style="color: #155724; margin: 0;">✓ Payment Successful!</h1>
        </div>
        
        <p>Great news! Your payment has been successfully processed and your order is confirmed.</p>
        
        <div style="background-color: #fff; border: 1px solid #dee2e6; border-radius: 5px; padding: 15px; margin: 20px 0;">
          <h2 style="color: #495057; font-size: 18px; margin-top: 0;">Order Details</h2>
          <p style="margin: 5px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
          <p style="margin: 5px 0;"><strong>Payment Date:</strong> ${new Date(order.paidAt || order.updatedAt).toLocaleDateString()}</p>
          <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">${order.status}</span></p>
        </div>

        <h2 style="color: #495057; font-size: 18px;">Order Items</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Product</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Qty</th>
              <th style="padding: 10px; text-align: right; border-bottom: 2px solid #dee2e6;">Price</th>
              <th style="padding: 10px; text-align: right; border-bottom: 2px solid #dee2e6;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding: 15px 10px; text-align: right; font-weight: bold; font-size: 18px;">
                Total Paid:
              </td>
              <td style="padding: 15px 10px; text-align: right; font-weight: bold; font-size: 18px; color: #28a745;">
                ₹${Number(order.totalAmount).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
          <p style="margin: 0;"><strong>What's Next?</strong></p>
          <p style="margin: 5px 0 0 0;">Your order is being prepared for shipment. You'll receive a shipping confirmation email with tracking details once your order ships.</p>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 14px;">
          <p>If you have any questions about your order, please contact our support team.</p>
          <p style="margin: 5px 0;">Thank you for your purchase!</p>
        </div>
      </body>
      </html>
    `;

    await this.emailService.sendMail(
      order.customerEmail,
      `Payment Successful - ${order.orderNumber}`,
      html,
    );

    this.logger.log(`Payment success email sent successfully for order ${order.orderNumber}`);
  }

  /**
   * Handle Payment Failed Email
   */
  private async handlePaymentFailed(
    job: Job<PaymentFailedEmailDto>,
  ): Promise<void> {
    const { orderId, reason } = job.data;

    this.logger.log(`Fetching order details for payment failed: ${orderId}`);

    // Fetch order
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderId}`);
      throw new Error(`Order not found: ${orderId}`);
    }

    this.logger.log(`Sending payment failed email for order ${order.orderNumber}`);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Failed</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8d7da; padding: 20px; border-radius: 5px; margin-bottom: 20px; border: 1px solid #f5c6cb;">
          <h1 style="color: #721c24; margin: 0;">Payment Failed</h1>
        </div>
        
        <p>We're sorry, but your payment could not be processed.</p>
        
        <div style="background-color: #fff; border: 1px solid #dee2e6; border-radius: 5px; padding: 15px; margin: 20px 0;">
          <h2 style="color: #495057; font-size: 18px; margin-top: 0;">Order Details</h2>
          <p style="margin: 5px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
          <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${Number(order.totalAmount).toFixed(2)}</p>
          <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #dc3545; font-weight: bold;">${order.status}</span></p>
          ${reason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${reason}</p>` : ''}
        </div>

        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <p style="margin: 0;"><strong>What You Can Do:</strong></p>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li>Check your payment details and try again</li>
            <li>Try a different payment method</li>
            <li>Contact your bank if the issue persists</li>
            <li>Contact our support team for assistance</li>
          </ul>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="#" style="display: inline-block; background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Retry Payment
          </a>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 14px;">
          <p>If you continue to experience issues, please contact our support team.</p>
          <p style="margin: 5px 0;">We're here to help!</p>
        </div>
      </body>
      </html>
    `;

    await this.emailService.sendMail(
      order.customerEmail,
      `Payment Failed - ${order.orderNumber}`,
      html,
    );

    this.logger.log(`Payment failed email sent successfully for order ${order.orderNumber}`);
  }
}
