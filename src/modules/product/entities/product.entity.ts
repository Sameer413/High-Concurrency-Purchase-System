import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { Favorite } from 'src/modules/favorite/entities/favorite.entity';

@Entity('products')
export class Product extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  originalPrice!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category!: string | null;

  @Column({ type: 'json', nullable: true })
  colors!: string[] | null;

  @Column({ type: 'json', nullable: true })
  sizes!: string[] | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating!: number;

  @Column({ type: 'int', default: 0 })
  reviews!: number;

  @Column({ type: 'boolean', default: false })
  isNew!: boolean;

  @Column({ type: 'int', default: 0 })
  stock!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => Favorite, (favorite) => favorite.product)
  favorites!: Favorite[];
}
