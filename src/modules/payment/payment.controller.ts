import * as express from 'express';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Headers,
  RawBodyRequest,
  Req,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { ResponseService } from 'src/common/services/response-service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { RazorpayService } from '../razorpay/razorpay.service';
import {
  RazorpayWebhookEvent,
  WebhookPayloadDto,
} from './dto/webhook-payload.dto';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly responseService: ResponseService,
    private readonly razorpayService: RazorpayService,
  ) {}

  /**
   * Step 1: Create Razorpay order
   * POST /payments/create
   *
   * Called from frontend before showing Razorpay checkout modal
   * Returns razorpayOrderId and razorpayKeyId needed for frontend
   * 
   * Supports idempotency via Idempotency-Key header
   * Header: Idempotency-Key: <unique-key>
   */
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: User,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const payment = await this.paymentService.createPayment(
      dto,
      user.id,
      idempotencyKey,
    );
    return this.responseService.success(
      payment,
      'Payment order created successfully',
    );
  }

  /**
   * Step 2: Verify payment signature
   * POST /payments/verify
   *
   * Called from frontend after Razorpay payment success callback
   * Verifies signature, updates order status, and converts reserved stock to sold
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyPayment(
    @Body() dto: VerifyPaymentDto,
    @CurrentUser() user: User,
  ) {
    const result = await this.paymentService.verifyPayment(dto, user.id);
    return this.responseService.success(
      result,
      'Payment verified successfully',
    );
  }

  /**
   * Get payment details by ID
   * GET /payments/:id
   */
  @Get(':id')
  async getPayment(@Param('id') id: string, @CurrentUser() user: User) {
    const payment = await this.paymentService.getPayment(id, user.id);
    return this.responseService.success(
      payment,
      'Payment retrieved successfully',
    );
  }

  /**
   * Get all payments for an order
   * GET /payments/order/:orderId
   */
  @Get('order/:orderId')
  async getOrderPayments(
    @Param('orderId') orderId: string,
    @CurrentUser() user: User,
  ) {
    const payments = await this.paymentService.getOrderPayments(
      orderId,
      user.id,
    );
    return this.responseService.success(
      payments,
      'Order payments retrieved successfully',
    );
  }

  /**
   * Handle payment failure
   * POST /payments/failure
   *
   * Called from frontend if Razorpay payment fails
   */
  @Post('failure')
  @HttpCode(HttpStatus.OK)
  async handlePaymentFailure(
    @Body()
    body: {
      orderId: string;
      razorpayOrderId: string;
      reason: string;
    },
  ) {
    await this.paymentService.handlePaymentFailure(
      body.orderId,
      body.razorpayOrderId,
      body.reason,
    );
    return this.responseService.success(null, 'Payment failure recorded');
  }

  /**
   * Get Razorpay public key
   * GET /payments/config/key
   *
   * Public endpoint to get Razorpay key for frontend
   */
  @Get('config/key')
  @HttpCode(HttpStatus.OK)
  async getRazorpayKey() {
    // This should be a public endpoint or you can include it in the create payment response
    return this.responseService.success(
      { key: process.env.RAZORPAY_KEY_ID },
      'Razorpay key retrieved',
    );
  }

  /**
   * Razorpay Webhook Handler
   * POST /payments/webhook
   *
   * Receives async payment updates from Razorpay
   * This endpoint must be public (no authentication)
   * Razorpay will send events like payment.captured, payment.failed, etc.
   *
   * IMPORTANT:
   * 1. Configure this URL in Razorpay Dashboard: https://dashboard.razorpay.com/app/webhooks
   * 2. Set webhook secret in environment variables
   * 3. This endpoint should be accessible publicly (add to public routes)
   */
  @Public() // Make this endpoint public (bypass JWT auth)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: any,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    try {
      // Get raw body for signature verification
      const rawBody = req.rawBody?.toString('utf-8') || JSON.stringify(req.body);

      // Verify webhook signature
      const isValid = await this.razorpayService.verifyWebhookSignature(
        rawBody,
        signature,
      );

      if (!isValid) {
        this.logger.warn('Invalid webhook signature received');
        throw new UnauthorizedException('Invalid webhook signature');
      }

      // Parse webhook payload
      const payload: WebhookPayloadDto = req.body as WebhookPayloadDto;

      this.logger.log(`Webhook received: ${payload.event}`);

      // Handle different webhook events
      switch (payload.event) {
        case RazorpayWebhookEvent.PAYMENT_AUTHORIZED:
          if (payload.payload.payment) {
            await this.paymentService.handlePaymentAuthorized(
              payload.payload.payment.entity,
            );
          }
          break;

        case RazorpayWebhookEvent.PAYMENT_CAPTURED:
          if (payload.payload.payment) {
            await this.paymentService.handlePaymentCaptured(
              payload.payload.payment.entity,
            );
          }
          break;

        case RazorpayWebhookEvent.PAYMENT_FAILED:
          if (payload.payload.payment) {
            await this.paymentService.handlePaymentFailedWebhook(
              payload.payload.payment.entity,
            );
          }
          break;

        case RazorpayWebhookEvent.ORDER_PAID:
          if (payload.payload.order) {
            await this.paymentService.handleOrderPaid(
              payload.payload.order.entity,
            );
          }
          break;

        case RazorpayWebhookEvent.REFUND_CREATED:
        case RazorpayWebhookEvent.REFUND_PROCESSED:
        case RazorpayWebhookEvent.REFUND_FAILED:
          // TODO: Implement refund handlers when needed
          this.logger.log(`Refund event received: ${payload.event}`);
          break;

        default:
          this.logger.log(`Unhandled webhook event: ${payload.event}`);
      }

      // Always return 200 OK to acknowledge receipt
      return { status: 'ok' };
    } catch (error) {
      this.logger.error('Webhook processing error:', error);

      // If signature is invalid, throw 401
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // For other errors, still return 200 to prevent Razorpay retries
      // Log the error for investigation
      return { status: 'error', message: 'Webhook processing failed' };
    }
  }
}
