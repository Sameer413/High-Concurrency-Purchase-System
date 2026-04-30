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
    // First, lock the row to prevent concurrent modifications
    // await manager.query(
    //   `SELECT * FROM inventory WHERE "productId" = $1 FOR UPDATE`,
    //   [productId],
    // );

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

    console.log(rows);
    console.log(rows.length);

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
      // const tStock = Number(
      //   row.totalStock ?? row.totalstock ?? row.total_stock ?? 0,
      // );
      // const rStock = Number(
      //   row.reservedStock ?? row.reservedstock ?? row.reserved_stock ?? 0,
      // );

      return {
        success: false,
        // availableStock: tStock - rStock,
        availableStock:
          Number(row.totalStock || 0) - Number(row.reservedStock || 0),
      };
    }

    const row = rows[0];
    // const tStock = Number(
    //   row.totalStock ?? row.totalstock ?? row.total_stock ?? 0,
    // );
    // const rStock = Number(
    //   row.reservedStock ?? row.reservedstock ?? row.reserved_stock ?? 0,
    // );

    return {
      success: true,
      // availableStock: tStock - rStock,
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
  // CONFIRM SALE
  // -----------------------------------
  async confirmSale(productId: string, quantity: number): Promise<Inventory> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `
        UPDATE inventory
        SET "reservedStock" = "reservedStock" - $2,
            "totalStock" = "totalStock" - $2,
            "soldStock" = "soldStock" + $2,
            "updatedAt" = NOW()
        WHERE "productId" = $1
        AND "reservedStock" >= $2
        RETURNING *
        `,
        [productId, quantity],
      );

      if (rows.length === 0) {
        throw new BadRequestException('Not enough reserved stock');
      }

      const inventory = rows[0];

      await this.syncProductStock(manager, productId, inventory.totalStock);

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

      await this.syncProductStock(manager, productId, inventory.totalStock);

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

      await this.syncProductStock(manager, productId, totalStock);

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

  // -----------------------------------
  // PRODUCT STOCK SYNC
  // -----------------------------------
  private async syncProductStock(
    manager: EntityManager,
    productId: string,
    stock: number,
  ) {
    await manager.update(Product, productId, {
      stock,
    });
  }
}
