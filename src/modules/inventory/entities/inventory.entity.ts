import { Column, Entity, Index, JoinColumn, OneToOne, Check } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { Product } from '../../product/entities/product.entity';

@Entity('inventory')
@Check('"totalStock" >= 0')
@Check('"reservedStock" >= 0')
@Check('"soldStock" >= 0')
@Check('"reservedStock" <= "totalStock"')
export class Inventory extends BaseEntity {
  // @Index({ unique: true })
  @Column({ type: 'uuid' })
  productId!: string;

  @OneToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Column({ type: 'int', default: 0 })
  totalStock!: number;

  @Column({ type: 'int', default: 0 })
  reservedStock!: number;

  @Column({ type: 'int', default: 0 })
  soldStock!: number;

  // Computed property for available stock
  get availableStock(): number {
    return this.totalStock - this.reservedStock;
  }

  //   // Helper method to check if stock is available
  //   canReserve(quantity: number): boolean {
  //     return this.availableStock >= quantity;
  //   }

  //   // Helper method to reserve stock
  //   reserve(quantity: number): boolean {
  //     if (!this.canReserve(quantity)) {
  //       return false;
  //     }
  //     this.reservedStock += quantity;
  //     return true;
  //   }

  //   // Helper method to release reserved stock
  //   releaseReservation(quantity: number): void {
  //     this.reservedStock = Math.max(0, this.reservedStock - quantity);
  //   }

  //   // Helper method to confirm sale (move from reserved to sold)
  //   confirmSale(quantity: number): boolean {
  //     if (this.reservedStock < quantity) {
  //       return false;
  //     }
  //     this.reservedStock -= quantity;
  //     this.soldStock += quantity;
  //     this.totalStock -= quantity;
  //     return true;
  //   }

  //   // Helper method to restock
  //   restock(quantity: number): void {
  //     this.totalStock += quantity;
  //   }
}
