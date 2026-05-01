// import {
//     Entity,
//     Column,
//     ManyToOne,
//     JoinColumn,
// } from 'typeorm';
// import { Order } from './order.entity';
// import { BaseEntity } from 'src/database/entities/base.entity';

// @Entity('order_discounts')
// export class OrderDiscount extends BaseEntity {
//     @Column('uuid')
//     orderId!: string;

//     @ManyToOne(() => Order, (o) => o.discounts, {
//         onDelete: 'CASCADE',
//     })
//     @JoinColumn({ name: 'orderId' })
//     order!: Order;

//     @Column()
//     discountType!: string;

//     @Column({ nullable: true })
//     discountCode!: string;

//     @Column()
//     discountName!: string;

//     @Column('decimal', { precision: 10, scale: 2 })
//     discountValue!: number;

//     @Column('decimal', { precision: 10, scale: 2 })
//     discountAmount!: number;
// }