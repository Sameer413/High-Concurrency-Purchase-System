import { Entity, ManyToOne, Column, Index, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { Cart } from './cart.entity';
import { Product } from 'src/modules/product/entities/product.entity';

@Entity('cart_items')
// @Index(['cart', 'product', 'selectedSize', 'selectedColor'], {
//   unique: true,
// })
export class CartItem extends BaseEntity {
  @ManyToOne(() => Cart, (cart) => cart.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'cartId' })
  cart!: Cart;

  @ManyToOne(() => Product, { eager: true })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ type: 'varchar', length: 30, nullable: true })
  selectedSize!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  selectedColor!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  priceSnapshot!: number;
}
