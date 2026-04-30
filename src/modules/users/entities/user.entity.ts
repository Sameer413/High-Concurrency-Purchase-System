import { Column, Entity, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../../database/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';
import { Address } from 'src/modules/address/entities/address.entity';
import { Order } from 'src/modules/order/entities/order.entity';
import { Favorite } from 'src/modules/favorite/entities/favorite.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ length: 100 })
  firstName!: string;

  @Column({ length: 100 })
  lastName!: string;

  @Exclude()
  @Column()
  password!: string;

  @Column({ type: 'simple-array', default: Role.USER })
  roles!: Role[];

  @Column({ default: true })
  isActive!: boolean;

  @Exclude()
  @Column({ nullable: true, type: 'text' })
  hashedRefreshToken!: string | null;

  @OneToMany(() => Address, (address) => address.user)
  addresses!: Address[];

  @OneToMany(() => Order, (order) => order.user)
  orders!: Order[];

  @OneToMany(() => Favorite, (favorite) => favorite.user)
  favorites!: Favorite[];

  // @OneToMany(() => Payment, (payment) => payment.user)
  // payments: Payment[];
}
