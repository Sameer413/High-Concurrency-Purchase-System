import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Inventory } from './entities/inventory.entity';
import { Product } from '../product/entities/product.entity';

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,

    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  // -----------------------------------
  // GET INVENTORY
  // -----------------------------------
  async getByProductId(productId: string): Promise<Inventory> {
    const inventory = await this.inventoryRepo.findOne({
      where: { productId },
      relations: ['product'],
    });

    if (!inventory) {
      throw new NotFoundException(`Inventory not found for ${productId}`);
    }

    return inventory;
  }

  // -----------------------------------
  // GET MULTIPLE INVENTORIES BY PRODUCT IDS
  // -----------------------------------
  async getByProductIds(productIds: string[]): Promise<Inventory[]> {
    if (productIds.length === 0) {
      return [];
    }

    return this.inventoryRepo
      .createQueryBuilder('inventory')
      .where('inventory.productId IN (:...productIds)', { productIds })
      .getMany();
  }

  // -----------------------------------
  // CHECK AVAILABILITY
  // -----------------------------------
  async checkAvailability(
    productId: string,
    quantity: number,
  ): Promise<boolean> {
    const inventory = await this.getByProductId(productId);
    return inventory.availableStock >= quantity;
  }

  // -----------------------------------
  // TRANSACTION SAFE RESERVE
  // -----------------------------------
  async reserveStockTx(
    manager: EntityManager,
    productId: string,
    quantity: number,
  ): Promise<{
    success: boolean;
    availableStock: number;
  }> {
    const result = await manager.query(
      `
      UPDATE inventory
      SET "reservedStock" = "reservedStock" + $2,
          "updatedAt" = NOW()
      WHERE "productId" = $1
      AND ("totalStock" - "reservedStock") >= $2
      RETURNING "totalStock", "reservedStock"
      `,
      [productId, quantity],
    );

    // 🔥 normalize response
    const rows = Array.isArray(result[0]) ? result[0] : result;

    if (rows.length === 0) {
      const stock = await manager.query(
        `
        SELECT "totalStock", "reservedStock"
        FROM inventory
        WHERE "productId" = $1
        `,
        [productId],
      );

      const row = stock[0] || {};

      return {
        success: false,
        availableStock:
          Number(row.totalStock || 0) - Number(row.reservedStock || 0),
      };
    }

    const row = rows[0];

    return {
      success: true,
      availableStock: Number(row.totalStock) - Number(row.reservedStock),
    };
  }

  // -----------------------------------
  // NORMAL RESERVE (non transaction)
  // -----------------------------------
  async reserveStock(productId: string, quantity: number) {
    return this.dataSource.transaction(async (manager) => {
      return this.reserveStockTx(manager, productId, quantity);
    });
  }

  // -----------------------------------
  // RELEASE RESERVED STOCK
  // -----------------------------------
  async releaseReservation(
    productId: string,
    quantity: number,
  ): Promise<Inventory> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        UPDATE inventory
        SET "reservedStock" =
          GREATEST(0, "reservedStock" - $2),
          "updatedAt" = NOW()
        WHERE "productId" = $1
        `,
        [productId, quantity],
      );

      return manager.findOneOrFail(Inventory, {
        where: { productId },
      });
    });
  }

  // -----------------------------------
  // CONFIRM SALE (Transaction-safe version)
  // -----------------------------------
  async confirmSaleTx(
    manager: EntityManager,
    productId: string,
    quantity: number,
  ): Promise<void> {
    const result = await manager.query(
      `
      UPDATE inventory
      SET "reservedStock" = "reservedStock" - $2,
          "totalStock" = "totalStock" - $2,
          "soldStock" = "soldStock" + $2,
          "updatedAt" = NOW()
      WHERE "productId" = $1
      AND "reservedStock" >= $2
      RETURNING "totalStock"
      `,
      [productId, quantity],
    );

    const rows = Array.isArray(result[0]) ? result[0] : result;

    if (rows.length === 0) {
      throw new BadRequestException('Not enough reserved stock');
    }

    const row = rows[0];
  }

  // -----------------------------------
  // CONFIRM SALE (Standalone)
  // -----------------------------------
  async confirmSale(productId: string, quantity: number): Promise<Inventory> {
    return this.dataSource.transaction(async (manager) => {
      await this.confirmSaleTx(manager, productId, quantity);

      return manager.findOneOrFail(Inventory, {
        where: { productId },
      });
    });
  }

  // -----------------------------------
  // RESTOCK
  // -----------------------------------
  async restock(productId: string, quantity: number): Promise<Inventory> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        UPDATE inventory
        SET "totalStock" = "totalStock" + $2,
            "updatedAt" = NOW()
        WHERE "productId" = $1
        `,
        [productId, quantity],
      );

      const inventory = await manager.findOneOrFail(Inventory, {
        where: { productId },
      });

      return inventory;
    });
  }

  // -----------------------------------
  // UPSERT
  // -----------------------------------
  async upsert(productId: string, totalStock: number): Promise<Inventory> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        INSERT INTO inventory
        ("productId","totalStock","reservedStock","soldStock","createdAt","updatedAt")
        VALUES ($1,$2,0,0,NOW(),NOW())
        ON CONFLICT ("productId")
        DO UPDATE SET
          "totalStock" = EXCLUDED."totalStock",
          "updatedAt" = NOW()
        `,
        [productId, totalStock],
      );

      return manager.findOneOrFail(Inventory, {
        where: { productId },
      });
    });
  }

  // -----------------------------------
  // LOW STOCK
  // -----------------------------------
  async getLowStockItems(threshold = 10): Promise<Inventory[]> {
    return this.inventoryRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.product', 'product')
      .where('inv.totalStock - inv.reservedStock <= :threshold', { threshold })
      .getMany();
  }

  // -----------------------------------
  // STATS
  // -----------------------------------
  async getStatistics() {
    const stats = await this.inventoryRepo
      .createQueryBuilder('inv')
      .select('SUM(inv.totalStock)', 'totalStock')
      .addSelect('SUM(inv.reservedStock)', 'reservedStock')
      .addSelect('SUM(inv.soldStock)', 'soldStock')
      .getRawOne();

    return {
      totalStock: Number(stats.totalStock) || 0,
      reservedStock: Number(stats.reservedStock) || 0,
      soldStock: Number(stats.soldStock) || 0,
    };
  }


}
