import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Product } from '../product/entities/product.entity';
import { RedisService } from 'src/database/redis/redis.service';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepo: Repository<OrderItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateOrderDto, userId: string): Promise<Order> {
    const { reservationId } = dto;

    // Step 1: Get reservation from Redis
    const reservationRaw = await this.redisService.get(reservationId);
    if (!reservationRaw) {
      throw new NotFoundException('Reservation not found');
    }

    const reservation = JSON.parse(reservationRaw);

    // Step 2: Validate ownership of reservation
    if (reservation.userId !== userId) {
      throw new NotFoundException('Reservation not found for this user');
    }

    // Step 3: Prevent duplicate order creation for the same reservation (atomic lock)
    const lockKey = `lock:order:${reservationId}`;
    const lockValue = `${userId}-${Date.now()}`; // Unique lock value for safe release
    const lockAcquired = await this.redisService.acquireLock(lockKey, lockValue, 30);

    if (!lockAcquired) {
      throw new NotFoundException(
        'Order is already being created for this reservation',
      );
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Step 4: Check if order already exists for this reservation (idempotency check)
        const existing = await manager.findOne(Order, {
          where: { reservationId },
        });

        if (existing) {
          return existing; // Return existing order if found
        }

        // Step 5: Compute total amount
        let totalAmount = 0;
        const orderItems: Partial<OrderItem>[] = reservation.items.map(
          (item: any) => {
            const totalPrice = item.unitPrice * item.quantity;
            totalAmount += totalPrice;

            return {
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice,
            };
          },
        );

        // Step 6: Create order with totalAmount
        const order = manager.create(Order, {
          orderNumber: this.generateOrderNumber(),
          userId,
          reservationId,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone,
          totalAmount, // ✅ Fixed: Include computed totalAmount
          currency: 'INR',
          status: 'PENDING',
        });

        const savedOrder = await manager.save(order);

        // Step 7: Save order items
        const itemsToSave = orderItems.map((item) =>
          manager.create(OrderItem, {
            ...item,
            orderId: savedOrder.id,
          }),
        );
        await manager.save(OrderItem, itemsToSave);

        // Step 8: Delete reservation
        await this.redisService.del(reservationId);

        return savedOrder;
      });
    } finally {
      // Safe lock release - only releases if we still own the lock
      await this.redisService.releaseLock(lockKey, lockValue);
    }
  }
  

  async findAll(limit = 50): Promise<Order[]> {
    return this.ordersRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['items'],
    });
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.ordersRepo.findOne({
      where: { id },
      relations: ['items', 'payments', 'user'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async update(id: string, dto: UpdateOrderDto): Promise<Order> {
    const order = await this.findOne(id);

    // if (dto.customerEmail !== undefined) {
    //   order.customerEmail = dto.customerEmail;
    // }

    // if (dto.customerPhone !== undefined) {
    //   order.customerPhone = dto.customerPhone;
    // }

    // if (dto.shippingFirstName !== undefined) {
    //   order.shippingFirstName = dto.shippingFirstName;
    // }

    // if (dto.shippingLastName !== undefined) {
    //   order.shippingLastName = dto.shippingLastName;
    // }

    // if (dto.shippingAddressLine1 !== undefined) {
    //   order.shippingAddressLine1 = dto.shippingAddressLine1;
    // }

    // if (dto.shippingAddressLine2 !== undefined) {
    //   order.shippingAddressLine2 = dto.shippingAddressLine2;
    // }

    // if (dto.shippingCity !== undefined) {
    //   order.shippingCity = dto.shippingCity;
    // }

    // if (dto.shippingState !== undefined) {
    //   order.shippingState = dto.shippingState;
    // }

    // if (dto.shippingPostalCode !== undefined) {
    //   order.shippingPostalCode = dto.shippingPostalCode;
    // }

    // if (dto.shippingCountry !== undefined) {
    //   order.shippingCountry = dto.shippingCountry;
    // }

    // if (dto.sameAsShipping !== undefined) {
    //   order.sameAsShipping = dto.sameAsShipping;
    // }

    // if (dto.notes !== undefined) {
    //   order.notes = dto.notes;
    // }

    // if (dto.specialInstructions !== undefined) {
    //   order.specialInstructions = dto.specialInstructions;
    // }

    return this.ordersRepo.save(order);
  }

  async remove(id: string): Promise<void> {
    const order = await this.findOne(id);
    await this.ordersRepo.remove(order);
  }

  // Generate order number: ORD-YYYY-NNNNNN
  private generateOrderNumber(): string {
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString(36).toUpperCase();
    return `ORD-${year}-${timestamp}`;
  }
}
