import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { RedisService } from 'src/database/redis/redis.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  Reservation,
  ReservationStatus,
} from '../inventory/entities/reservation.entity';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly redisService: RedisService,
    private readonly inventoryService: InventoryService,
    // @InjectRepository(Reservation)
    // private readonly reservationRepo: Repository<Reservation>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.productRepo.create({
      ...dto,
      description: dto.description ?? null,
      stock: dto.stock ?? 0,
      isActive: dto.isActive ?? true,
    });
    return this.productRepo.save(product);
  }

  async findAll(
    limit = 20,
    page: number = 1,
    search: string = '',
  ): Promise<Product[]> {
    const key = `products:${page}:${limit}:${search}`;

    const cached = await this.redisService.get(key);

    if (cached) {
      return JSON.parse(cached);
    }

    const query = this.productRepo.createQueryBuilder('product');
    query.where({ isActive: true });
    if (search) {
      query.andWhere('product.name LIKE :search', { search: `%${search}%` });
    }
    query.orderBy('product.createdAt', 'DESC');
    query.take(limit);
    query.skip((page - 1) * limit);

    const products = await query.getMany();
    await this.redisService.set(key, JSON.stringify(products), 60); // Cache for 60 seconds

    return products;
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id } });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async getProductAvailability(
    id: string,
  ): Promise<{ availableStock: number; canBuy: boolean }> {
    // Short key for cost and readability. Format: p:{id}:a = product availability
    const cacheKey = `p:${id}:a`;
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      const data = JSON.parse(cached);
      return {
        availableStock: data.availableStock,
        canBuy: data.canBuy,
      };
    }

    // Get product to check if it's active
    const product = await this.productRepo.findOne({
      where: { id },
      select: ['id', 'isActive', 'stock'],
    });

    if (!product || !product.isActive) {
      const result = { availableStock: 0, canBuy: false };
      // Short TTL for availability - just 3 seconds
      await this.redisService.set(cacheKey, JSON.stringify(result), 5);
      return result;
    }

    // Get actual available stock from inventory (accounts for reserved stock)
    try {
      const inventory = await this.inventoryService.getByProductId(id);
      const result = {
        availableStock: inventory.availableStock, // totalStock - reservedStock
        canBuy: inventory.availableStock > 0,
      };

      // Short TTL for availability - just 3 seconds
      await this.redisService.set(cacheKey, JSON.stringify(result), 5);
      return result;
    } catch (error) {
      // If inventory doesn't exist, fall back to product.stock
      const result = {
        availableStock: product.stock || 0,
        canBuy: (product.stock || 0) > 0, // This can be just replaced with (availableStock > 0), but keeping it clear
      };

      // Short TTL for availability - just 5 seconds
      await this.redisService.set(cacheKey, JSON.stringify(result), 5);
      return result;
    }
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    if (dto.name !== undefined) product.name = dto.name;
    if (dto.description !== undefined)
      product.description = dto.description ?? null;
    if (dto.price !== undefined) product.price = dto.price;
    if (dto.stock !== undefined) product.stock = dto.stock;
    if (dto.isActive !== undefined) product.isActive = dto.isActive;
    return this.productRepo.save(product);
  }

  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    await this.productRepo.remove(product);
  }

  // Reserves stock for a purchase. Throws exception if not enough stock.
  async buy(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<{
    success: boolean;
    availableStock: number;
  }> {
    const reservationMinutes = 10;

    // 1. Main DB Transaction (Source of Truth)
    const result = await this.dataSource.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const reservationRepo = manager.getRepository(Reservation);

      // 1. Validate Product
      const product = await productRepo.findOne({
        where: { id: productId },
        select: ['id', 'isActive'],
      });

      if (!product || !product.isActive) {
        throw new ConflictException('Product is not available');
      }

      // Reserve Inventory Atomically
      const inventory = await this.inventoryService.reserveStockTx(
        manager,
        productId,
        quantity,
      );

      if (!inventory.success) {
        throw new ConflictException({
          code: 'OUT_OF_STOCK',
          message: `Only ${inventory.availableStock} items available`,
          availableStock: inventory.availableStock,
        });
        // return {
        //   success: false,
        //   availableStock: inventory.availableStock,
        //   message: `Only ${inventory.availableStock} items available`,
        // };
      }

      // Create a Reservation Row
      const expireAt = new Date(Date.now() + reservationMinutes * 60 * 1000);
      const reservation = reservationRepo.create({
        userId,
        productId,
        quantity,
        status: ReservationStatus.ACTIVE,
        expiresAt: expireAt,
      });

      await reservationRepo.save(reservation);

      return {
        success: true,
        reservationId: reservation.id,
        expireAt,
        availableStock: inventory.availableStock,
      };
    });

    // 2. Cache Reservation in Redis (for quick access and expiration handling)
    // Key format: r:{reservationId} = reservation details
    try {
      await this.redisService.set(
        `r:${result.reservationId}`,
        JSON.stringify({
          reservationId: result.reservationId,
          userId,
          productId,
          quantity,
          expireAt: result.expireAt,
        }),
        reservationMinutes * 60,
      );

      // 3. Invalidate availability cache for the product
      await this.redisService.del(`p:${productId}:a`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.warn(
          `Redis sync failed for reservation ${result.reservationId}`,
          error.stack,
        );
      } else {
        this.logger.warn(
          `Redis sync failed for reservation ${result.reservationId}`,
          String(error),
        );
      }
    }

    return result;
  }
}
