import {
    Entity,
    Column,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Payment } from './payment.entity';
import { BaseEntity } from '../../../database/entities/base.entity';
import { Order } from '../../order/entities/order.entity';

@Entity('payment_refunds')
export class PaymentRefund extends BaseEntity {
    @Column('uuid')
    paymentId!: string;

    @ManyToOne(() => Payment, (p) => p.refunds)
    @JoinColumn({ name: 'paymentId' })
    payment!: Payment;

    @Column('uuid')
    orderId!: string;

    @ManyToOne(() => Order)
    @JoinColumn({ name: 'orderId' })
    order!: Order;

    @Column('decimal', { 
        precision: 10, 
        scale: 2,
        transformer: {
            to: (value: number) => value,
            from: (value: string) => parseFloat(value),
        }
    })
    refundAmount!: number;

    @Column({ nullable: true })
    refundReason!: string;

    @Column({ default: 'pending' })
    refundStatus!: string;
}