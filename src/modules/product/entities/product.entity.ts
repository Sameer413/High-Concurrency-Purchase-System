import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { Favorite } from 'src/modules/favorite/entities/favorite.entity';

@Entity('products')
@Index(['isActive', 'category', 'price'])
export class Product extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index()
  @Column({ 
    type: 'decimal', 
    precision: 10, 
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    }
  })
  price!: number;

  @Column({ 
    type: 'decimal', 
    precision: 10, 
    scale: 2, 
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => value ? parseFloat(value) : null,
    }
  })
  originalPrice!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  category!: string | null;

  @Column({ type: 'json', nullable: true })
  colors!: string[] | null;

  @Column({ type: 'json', nullable: true })
  sizes!: string[] | null;

  @Index()
  @Column({ 
    type: 'decimal', 
    precision: 3, 
    scale: 2, 
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    }
  })
  rating!: number;

  @Column({ type: 'int', default: 0 })
  reviews!: number;

  @Index()
  @Column({ type: 'boolean', default: false })
  isNew!: boolean;

  @Index()
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => Favorite, (favorite) => favorite.product)
  favorites!: Favorite[];
}
