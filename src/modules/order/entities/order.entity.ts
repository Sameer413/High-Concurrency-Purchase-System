import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { OrderItem } from './order-item.entity';
// import { OrderStatusHistory } from './order-status-history.entity';
// import { OrderShipment } from './order-shipment.entity';
// import { OrderDiscount } from './order-discount.entity';
// import { OrderNote } from './order-note.entity';
import { BaseEntity } from 'src/database/entities/base.entity';
import { Payment } from 'src/modules/payment/entities/payment.entity';

@Entity('orders')
export class Order extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 20 })
  orderNumber!: string;

  @Index()
  @Column('uuid')
  userId!: string;

  @ManyToOne(() => User, (user) => user.orders, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user!: User;

  // 🔥 Keep status simple but controlled
  @Column({ default: 'PENDING' })
  status!: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';

  // 🔥 Core pricing
  @Column('decimal', { precision: 10, scale: 2 })
  totalAmount!: number;

  @Column({ length: 3, default: 'INR' })
  currency!: string;

  // 🔗 Important: connect to reservation
  @Column('uuid', { unique: true })
  reservationId!: string;

  // 👤 minimal user info (snapshot)
  @Column()
  customerEmail!: string;

  @Column({ nullable: true })
  customerPhone!: string;

  // ⏱️ lifecycle
  @Column({ type: 'timestamptz', nullable: true })
  paidAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt!: Date;

  // relations
  @OneToMany(() => OrderItem, (item) => item.order)
  items!: OrderItem[];

  @OneToMany(() => Payment, (p) => p.order)
  payments!: Payment[];
}
