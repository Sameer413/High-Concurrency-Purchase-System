import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { Product } from '../../product/entities/product.entity';

export enum ReservationStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
}

@Entity('reservations')
export class Reservation extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', nullable: true })
  productId?: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'int', nullable: true })
  quantity?: number;

  @Column({ type: 'jsonb', nullable: true })
  items?: any;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.ACTIVE,
  })
  status!: ReservationStatus;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;
}
