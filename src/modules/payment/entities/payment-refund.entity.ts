import {
    Entity,
    Column,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { Payment } from './payment.entity';
import { BaseEntity } from '../../../database/entities/base.entity';
import { Order } from '../../order/entities/order.entity';

export enum RefundStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('payment_refunds')
export class PaymentRefund extends BaseEntity {
    @Column('uuid')
    paymentId!: string;

    @ManyToOne(() => Payment, (p) => p.refunds)
    @JoinColumn({ name: 'paymentId' })
    payment!: Payment;

    @Column('uuid')
    orderId!: string;

    @ManyToOne(() => Order, (o) => o.refunds)
    @JoinColumn({ name: 'orderId' })
    order!: Order;

    @Index()
    @Column({ type: 'varchar', nullable: true })
    razorpayRefundId!: string | null;

    @Column('decimal', { 
        precision: 10, 
        scale: 2,
        transformer: {
            to: (value: number) => value,
            from: (value: string) => parseFloat(value),
        }
    })
    refundAmount!: number;

    @Column({ length: 3, default: 'INR' })
    currency!: string;

    @Column({ type: 'text', nullable: true })
    refundReason!: string | null;

    @Column({
        type: 'enum',
        enum: RefundStatus,
        default: RefundStatus.PENDING,
    })
    refundStatus!: RefundStatus;

    @Column({ type: 'jsonb', nullable: true })
    metadata!: Record<string, any>;
}