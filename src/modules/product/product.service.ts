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
import { GetProductsQueryDto } from './dto/get-products-query.dto';
import { RedisService } from 'src/database/redis/redis.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  Reservation,
  ReservationStatus,
} from '../inventory/entities/reservation.entity';
import { ReservationItemDTO } from './dto/reservation-item.dto';
import { InventoryQueueService } from '../queue/services/inventory-queue.service';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly redisService: RedisService,
    private readonly inventoryService: InventoryService,
    private readonly inventoryQueueService: InventoryQueueService,
    // @InjectRepository(Reservation)
    // private readonly reservationRepo: Repository<Reservation>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.productRepo.create({
      ...dto,
      description: dto.description ?? null,
      isActive: dto.isActive ?? true,
    });
    const savedProduct = await this.productRepo.save(product);

    // Initialize inventory for the new product
    await this.inventoryService.upsert(savedProduct.id, dto.initialStock ?? 0);

    return savedProduct;
  }

  async findAll(
    query: GetProductsQueryDto,
  ): Promise<
    Array<
      Product & {
        availableStock: number;
        totalStock: number;
        isAvailable: boolean;
      }
    >
  > {
    const {
      limit = 20,
      page = 1,
      search = '',
      category,
      minPrice,
      maxPrice,
      colors,
      newOnly,
      inStockOnly = true,
      sortBy,
    } = query;

    // Build cache key from all query parameters
    const cacheKey = `products:list:${JSON.stringify(query)}`;

    // Use cache-aside pattern with 30-second TTL
    return this.redisService.cacheAside(
      cacheKey,
      async () => {
        // Build query
        const queryBuilder = this.productRepo.createQueryBuilder('product');
        queryBuilder.where({ isActive: true });

        // Search filter
        if (search) {
          queryBuilder.andWhere(
            '(product.name ILIKE :search OR product.description ILIKE :search)',
            { search: `%${search}%` },
          );
        }

        // Category filter
        if (category && category !== 'All') {
          queryBuilder.andWhere('product.category = :category', { category });
        }

        // Price range filter
        if (minPrice !== undefined || maxPrice !== undefined) {
          if (minPrice !== undefined && maxPrice !== undefined) {
            queryBuilder.andWhere('product.price BETWEEN :minPrice AND :maxPrice', {
              minPrice,
              maxPrice,
            });
          } else if (minPrice !== undefined) {
            queryBuilder.andWhere('product.price >= :minPrice', { minPrice });
          } else if (maxPrice !== undefined) {
            queryBuilder.andWhere('product.price <= :maxPrice', { maxPrice });
          }
        }

        // Colors filter (JSON array contains any of the specified colors)
        if (colors) {
          const colorArray = colors.split(',').map((c) => c.trim());
          queryBuilder.andWhere(
            'EXISTS (SELECT 1 FROM jsonb_array_elements_text(product.colors) AS color WHERE color = ANY(:colors))',
            { colors: colorArray },
          );
        }

        // New only filter
        if (newOnly) {
          queryBuilder.andWhere('product.isNew = :isNew', { isNew: true });
        }

        // Sorting
        switch (sortBy) {
          case 'price-asc':
            queryBuilder.orderBy('product.price', 'ASC');
            break;
          case 'price-desc':
            queryBuilder.orderBy('product.price', 'DESC');
            break;
          case 'name':
            queryBuilder.orderBy('product.name', 'ASC');
            break;
          case 'rating':
            queryBuilder.orderBy('product.rating', 'DESC');
            break;
          case 'newest':
            queryBuilder.orderBy('product.createdAt', 'DESC');
            break;
          default:
            queryBuilder.orderBy('product.createdAt', 'DESC');
        }

        // Pagination
        queryBuilder.take(limit);
        queryBuilder.skip((page - 1) * limit);

        const products = await queryBuilder.getMany();

        // Fetch inventory data for all products
        const productIds = products.map((p) => p.id);
        const inventories = await this.inventoryService.getByProductIds(productIds);

        // Create a map for quick lookup
        const inventoryMap = new Map(
          inventories.map((inv) => [inv.productId, inv]),
        );

        // Combine product data with inventory data
        let productsWithAvailability = products.map((product) => {
          const inventory = inventoryMap.get(product.id);
          const availableStock = inventory?.availableStock ?? 0;
          const totalStock = inventory?.totalStock ?? 0;

          return {
            ...product,
            availableStock,
            totalStock,
            isAvailable: availableStock > 0,
          };
        });

        // Filter by stock availability if requested
        if (inStockOnly) {
          productsWithAvailability = productsWithAvailability.filter(
            (p) => p.isAvailable,
          );
        }

        return productsWithAvailability;
      },
      30, // 30 seconds TTL
    );
  }

  async findOne(id: string): Promise<Product> {
    // Use cache-aside pattern with 5-minute TTL
    return this.redisService.cacheAside(
      `product:${id}`,
      async () => {
        const product = await this.productRepo.findOne({ where: { id } });

        if (!product) {
          throw new NotFoundException('Product not found');
        }

        return product;
      },
      300, // 5 minutes
    );
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
      select: ['id', 'isActive'],
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
      // If inventory doesn't exist, return 0 stock
      const result = {
        availableStock: 0,
        canBuy: false,
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
    let result: {
      success: boolean;
      reservationId: string;
      expireAt: Date;
    };

    // 1. Main DB Transaction (Source of Truth)
    result = await this.dataSource.transaction(async (manager) => {
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

      // 6. Schedule cleanup job at expiration time (Event-Driven)
      await this.inventoryQueueService.scheduleReservationCleanup(
        reservation.id,
        expireAt,
      ).catch((err) => {
        this.logger.error(
          `Failed to schedule cleanup for reservation ${reservation.id}: ${err.message}`,
        );
        // Don't throw - cron will catch it as backup
      });

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

    // ✅ FIXED: Redis operations AFTER transaction commits
    // This ensures DB changes are committed before Redis cache is updated
    // If Redis fails, DB is still consistent and cron job will handle cleanup
    try {
      // Cache Reservation in Redis (for quick access and expiration handling)
      // Key format: r:{reservationId} = reservation details
      await this.redisService.set(
        `r:${result.reservationId}`,
        JSON.stringify(reservationSnapshot),
        reservationMinutes * 60,
      );

      // Invalidate availability cache for all products
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
      // Don't throw - DB transaction already committed successfully
      // Cron job will handle cleanup if Redis is down
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
