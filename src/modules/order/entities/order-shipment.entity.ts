import {
    Entity,
    Column,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { BaseEntity } from 'src/database/entities/base.entity';

@Entity('order_shipments')
export class OrderShipment extends BaseEntity {
    @Column('uuid')
    orderId!: string;

    @ManyToOne(() => Order, (o) => o.shipments)
    @JoinColumn({ name: 'orderId' })
    order!: Order;

    @Column()
    shippingMethod!: string;

    @Column({ nullable: true })
    shippingCarrier!: string;

    @Column({ nullable: true })
    trackingNumber!: string;

    @Column({ nullable: true })
    trackingUrl!: string;

    @Column({ default: 'pending' })
    shipmentStatus!: string;

    @Column({
        type: 'date',
        nullable: true,
    })
    estimatedDeliveryDate!: string;

    @Column({
        type: 'date',
        nullable: true,
    })
    actualDeliveryDate!: string;
}