import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../../product/entities/product.entity';
import { BaseEntity } from 'src/database/entities/base.entity';

@Entity('order_items')
export class OrderItem extends BaseEntity {
  @Index()
  @Column('uuid')
  orderId!: string;

  @ManyToOne(() => Order, (o) => o.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @Column('uuid')
  productId!: string;

  @Column({ type: 'text', nullable: true })
  selectedSize!: string | null;

  @Column({ type: 'text', nullable: true })
  selectedColor!: string | null;

  // 🔥 Snapshot fields (critical)
  @Column()
  productName!: string;

  @Column('decimal', { precision: 10, scale: 2 })
  unitPrice!: number;

  @Column('int')
  quantity!: number;

  @Column('decimal', { precision: 10, scale: 2 })
  totalPrice!: number;
}
