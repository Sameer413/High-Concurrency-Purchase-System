import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { PaymentRefund } from './payment-refund.entity';
import { BaseEntity } from '../../../database/entities/base.entity';
import { Order } from '../../order/entities/order.entity';

export enum PaymentStatus {
  CREATED = 'CREATED',
  PENDING = 'PENDING',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

@Entity('payments')
export class Payment extends BaseEntity {
  @Column('uuid')
  orderId!: string;

  @ManyToOne(() => Order, (o) => o.payments)
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  // 🔥 Idempotency (VERY IMPORTANT)
  // Unique index to prevent duplicate payments with same idempotency key
  @Index('idx_payments_idempotency_key', { 
    unique: true, 
    where: '"idempotencyKey" IS NOT NULL' 
  })
  @Column({ type: 'varchar', nullable: true, length: 255 })
  idempotencyKey!: string | null;

  // 🔥 Razorpay fields (IMPORTANT)
  @Index()
  @Column({ type: 'varchar' })
  razorpayOrderId!: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  razorpayPaymentId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  razorpaySignature!: string | null;

  // 💰 money
  @Column('decimal', { precision: 10, scale: 2 })
  amount!: number;

  @Column({ length: 3, default: 'INR' })
  currency!: string;

  // 🔄 status
  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.CREATED,
  })
  status!: PaymentStatus;

  // 💳 method (UPI, card, etc.)
  @Column({ type: 'varchar', nullable: true })
  method!: string | null;

  // 🧾 optional metadata
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any>;

  // 🔁 refunds
  @OneToMany(() => PaymentRefund, (refund) => refund.payment)
  refunds!: PaymentRefund[];
}
