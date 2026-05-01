// import {
//     Entity,
//     Column,
//     ManyToOne,
//     JoinColumn,
// } from 'typeorm';
// import { Order } from './order.entity';
// import { BaseEntity } from 'src/database/entities/base.entity';

// @Entity('order_status_history')
// export class OrderStatusHistory extends BaseEntity {
//     @Column('uuid')
//     orderId!: string;

//     @ManyToOne(() => Order, (o) => o.history, {
//         onDelete: 'CASCADE',
//     })
//     @JoinColumn({ name: 'orderId' })
//     order!: Order;

//     @Column({ nullable: true })
//     fromStatus!: string;

//     @Column()
//     toStatus!: string;

//     @Column('uuid', { nullable: true })
//     changedByUserId!: string;

//     @Column({ nullable: true })
//     changeReason!: string;

//     @Column({ nullable: true })
//     notes!: string;
// }