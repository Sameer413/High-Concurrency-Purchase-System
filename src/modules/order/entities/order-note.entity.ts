// import {
//     Entity,
//     Column,
//     ManyToOne,
//     JoinColumn,
// } from 'typeorm';
// import { Order } from './order.entity';
// import { BaseEntity } from 'src/database/entities/base.entity';

// @Entity('order_notes')
// export class OrderNote extends BaseEntity {
//     @Column('uuid')
//     orderId!: string;

//     @ManyToOne(() => Order, (o) => o.orderNotes, {
//         onDelete: 'CASCADE',
//     })
//     @JoinColumn({ name: 'orderId' })
//     order!: Order;

//     @Column()
//     noteType!: string;

//     @Column('text')
//     noteText!: string;

//     @Column('uuid', { nullable: true })
//     createdByUserId!: string;

//     @Column({ default: false })
//     isVisibleToCustomer!: boolean;
// }