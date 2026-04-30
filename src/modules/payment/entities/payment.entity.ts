import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { PaymentRefund } from './payment-refund.entity';
import { BaseEntity } from 'src/database/entities/base.entity';
import { Order } from 'src/modules/order/entities/order.entity';

export enum PaymentStatus {
  CREATED = 'CREATED',
  PENDING = 'PENDING',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

@Entity('payments')
export class Payment extends BaseEntity {
  //   @Index()
  @Column('uuid')
  orderId!: string;

  @ManyToOne(() => Order, (o) => o.payments)
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  // 🔥 Idempotency (VERY IMPORTANT)
  @Column({ nullable: true })
  idempotencyKey!: string;

  // 🔥 Razorpay fields (IMPORTANT)
  //   @Index({ unique: true })
  @Column()
  razorpayOrderId!: string;

  //   @Index({ unique: true, nullable: true })
  @Column({ nullable: true })
  razorpayPaymentId!: string;

  @Column({ nullable: true })
  razorpaySignature!: string;

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
  @Column({ nullable: true })
  method!: string;

  // 🧾 optional metadata
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any>;

  // 🔁 refunds
  @OneToMany(() => PaymentRefund, (refund) => refund.payment)
  refunds!: PaymentRefund[];
}
