import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { RedisService } from 'src/database/redis/redis.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  Reservation,
  ReservationStatus,
} from '../inventory/entities/reservation.entity';
import { ReservationItemDTO } from './dto/reservation-item.dto';

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
  async buyV2(
    userId: string,
    items: ReservationItemDTO[],
  ): Promise<{
    success: boolean;
    reservationId: string;
    expireAt: Date;
  }> {
    const reservationMinutes = 10;
    let reservationSnapshot: any;

    // 1. Main DB Transaction (Source of Truth)
    const result = await this.dataSource.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const reservationRepo = manager.getRepository(Reservation);

      // 1. Validate Product
      const productIds = items.map((i) => i.productId);

      const products = await productRepo.find({
        where: { id: In(productIds) },
        select: ['id', 'isActive'],
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      // 2. Validate all products
      for (const item of items) {
        const product = productMap.get(item.productId);

        if (!product || !product.isActive) {
          throw new ConflictException(
            `Product ${item.productId} is not available`,
          );
        }
      }

      // 3. Reserve Stock for all items (same transaction)
      for (const item of items) {
        const inventory = await this.inventoryService.reserveStockTx(
          manager,
          item.productId,
          item.quantity,
        );

        if (!inventory.success) {
          throw new ConflictException({
            code: 'OUT_OF_STOCK',
            message: `Only ${inventory.availableStock} items available for ${item.productId}`,
            availableStock: inventory.availableStock,
          });
        }
      }

      // 4. Build items snapshot (core logic)
      let totalAmount = 0;

      // Issue - below has some issue related to injection of price
      const itemsSnapshot = items.map((item) => {
        const product = productMap.get(item.productId)!;

        const unitPrice = Number(item?.unitPrice);
        const totalPrice = unitPrice * item.quantity;

        totalAmount += totalPrice;

        return {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice,
          totalPrice,
          selectedSize: item.selectedSize || null,
          selectedColor: item.selectedColor || null,
        };
      });

      // 5. Create DB reservation
      const expireAt = new Date(Date.now() + reservationMinutes * 60 * 1000);
      const reservation = reservationRepo.create({
        userId,
        status: ReservationStatus.ACTIVE,
        expiresAt: expireAt,
        items: itemsSnapshot, // Save items in DB to allow stock release on expiration
      });

      await reservationRepo.save(reservation);

      reservationSnapshot = {
        reservationId: reservation.id,
        userId,

        items: itemsSnapshot,

        totalAmount,
        currency: 'INR',

        createdAt: Date.now(),
        expireAt: expireAt.getTime(),

        version: 1,
      };

      return {
        success: true,
        reservationId: reservation.id,
        expireAt,
      };
    });

    // 6. Cache Reservation in Redis (for quick access and expiration handling)
    // Key format: r:{reservationId} = reservation details
    try {
      await this.redisService.set(
        `r:${result.reservationId}`,
        JSON.stringify(reservationSnapshot),
        reservationMinutes * 60,
      );

      // 3. Invalidate availability cache for all products
      const productIds = items.map((i) => i.productId);
      const keys = productIds.map((id) => `p:${id}:a`);

      if (keys.length) {
        await this.redisService.del(...keys);
      }
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

  // Validate and confirm a reservation (called when user completes checkout)
  async validateReservation(reservationId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    // 1. Check Redis (fast path)
    const cached = await this.redisService.get(`r:${reservationId}`);

    if (!cached) {
      return {
        success: false,
        message: 'Reservation expired',
      };
    }

    const reservationData = JSON.parse(cached);

    // 2. Validate expiry
    if (new Date(reservationData.expireAt) < new Date()) {
      return {
        success: false,
        message: 'Reservation expired',
      };
    }

    // 3. Optional: DB check (safety only)
    const reservation = await this.dataSource
      .getRepository(Reservation)
      .findOne({
        where: {
          id: reservationId,
          status: ReservationStatus.ACTIVE,
        },
      });

    if (!reservation) {
      return {
        success: false,
        message: 'Invalid reservation',
      };
    }

    return { success: true };
  }

  /**
   * Get reservation details by ID
   * Fetches from Redis cache for quick access
   */
  async getReservation(
    reservationId: string,
    userId: string,
  ): Promise<{
    reservationId: string;
    userId: string;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
    totalAmount: number;
    currency: string;
    createdAt: number;
    expireAt: number;
    version: number;
  }> {
    // 1. Try to get from Redis first (fast path)
    const redisKey = `r:${reservationId}`;
    const cached = await this.redisService.get(redisKey);

    if (cached) {
      const reservation = JSON.parse(cached);

      // Verify ownership
      if (reservation.userId !== userId) {
        throw new ConflictException('Unauthorized access to reservation');
      }

      // Check if expired
      if (Date.now() > reservation.expireAt) {
        throw new ConflictException('Reservation has expired');
      }

      return reservation;
    }

    // 2. If not in Redis, check DB (fallback)
    const dbReservation = await this.dataSource
      .getRepository(Reservation)
      .findOne({
        where: {
          id: reservationId,
          userId,
          status: ReservationStatus.ACTIVE,
        },
      });

    if (!dbReservation) {
      throw new ConflictException('Reservation not found or expired');
    }

    // Check if expired
    if (new Date() > dbReservation.expiresAt) {
      throw new ConflictException('Reservation has expired');
    }

    // Note: If we reach here, Redis cache was lost but DB reservation exists
    // This is a degraded state - we should log it
    this.logger.warn(
      `Reservation ${reservationId} found in DB but not in Redis cache`,
    );

    throw new ConflictException(
      'Reservation data temporarily unavailable. Please try again.',
    );
  }
}
