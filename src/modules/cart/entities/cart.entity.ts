import { Entity, OneToMany, OneToOne, JoinColumn, Column } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { CartItem } from './cart-item.entity';

@Entity('carts')
export class Cart extends BaseEntity {
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user!: User;

  @OneToMany(() => CartItem, (item) => item.cart, {
    cascade: true,
  })
  items!: CartItem[];

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
