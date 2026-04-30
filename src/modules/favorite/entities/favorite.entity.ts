import { BaseEntity } from 'src/database/entities/base.entity';
import { Product } from 'src/modules/product/entities/product.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('favorites')
export class Favorite extends BaseEntity {
  @ManyToOne(() => User, (user) => user.favorites, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Product, (product) => product.favorites, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'varchar', length: 20, nullable: true })
  size!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  color!: string | null;
}
