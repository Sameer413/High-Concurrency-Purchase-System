import { IsString, IsObject, IsEnum } from 'class-validator';

export enum RazorpayWebhookEvent {
  PAYMENT_AUTHORIZED = 'payment.authorized',
  PAYMENT_CAPTURED = 'payment.captured',
  PAYMENT_FAILED = 'payment.failed',
  ORDER_PAID = 'order.paid',
  REFUND_CREATED = 'refund.created',
  REFUND_PROCESSED = 'refund.processed',
  REFUND_FAILED = 'refund.failed',
}

export class WebhookPayloadDto {
  @IsEnum(RazorpayWebhookEvent)
  event!: RazorpayWebhookEvent;

  @IsObject()
  payload!: {
    payment?: {
      entity: RazorpayPaymentEntity;
    };
    order?: {
      entity: RazorpayOrderEntity;
    };
    refund?: {
      entity: RazorpayRefundEntity;
    };
  };

  @IsString()
  account_id!: string;

  @IsObject()
  contains!: string[];

  @IsString()
  created_at!: number;
}

export interface RazorpayPaymentEntity {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  order_id: string;
  invoice_id: string | null;
  international: boolean;
  method: string;
  amount_refunded: number;
  refund_status: string | null;
  captured: boolean;
  description: string | null;
  card_id: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  email: string;
  contact: string;
  notes: Record<string, any>;
  fee: number;
  tax: number;
  error_code: string | null;
  error_description: string | null;
  error_source: string | null;
  error_step: string | null;
  error_reason: string | null;
  acquirer_data: Record<string, any>;
  created_at: number;
}

export interface RazorpayOrderEntity {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  offer_id: string | null;
  status: string;
  attempts: number;
  notes: Record<string, any>;
  created_at: number;
}

export interface RazorpayRefundEntity {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  payment_id: string;
  notes: Record<string, any>;
  receipt: string | null;
  acquirer_data: Record<string, any>;
  created_at: number;
  batch_id: string | null;
  status: string;
  speed_processed: string;
  speed_requested: string;
}
