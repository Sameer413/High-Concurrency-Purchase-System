import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

@Injectable()
export class RazorpayService {
  private readonly razorpay: Razorpay;

  constructor(private readonly config: ConfigService) {
    this.razorpay = new Razorpay({
      key_id: this.config.get<string>('razorpay.keyId') ?? '',
      key_secret: this.config.get<string>('razorpay.keySecret') ?? '',
    });
  }

  async createOrder(params: {
    amount: number;
    currency: string;
    receipt: string;

    notes?: Record<string, string>;
  }) {
    try {
      return await this.razorpay.orders.create({
        amount: params.amount,
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes,
      });
    } catch {
      throw new InternalServerErrorException('Failed to create Razorpay order');
    }
  }

  async verifyPaymentSignature(data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    const body = data.razorpay_order_id + '|' + data.razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac('sha256', this.config.get<string>('razorpay.keySecret') ?? '')
      .update(body.toString())
      .digest('hex');

    return expectedSignature === data.razorpay_signature;
  }

  async verifyWebhookSignature(
    body: string,
    signature: string,
  ): Promise<boolean> {
    const expectedSignature = crypto
      .createHmac('sha256', this.config.get<string>('razorpay.keySecret') ?? '')
      .update(body)
      .digest('hex');
    return expectedSignature === signature;
  }

  getPublicKey(): string {
    return this.config.get<string>('razorpay.keyId') ?? '';
  }
}
