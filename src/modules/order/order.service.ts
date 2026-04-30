import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Product } from '../product/entities/product.entity';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepo: Repository<OrderItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async create(dto: CreateOrderDto): Promise<Order> {
    const product = await this.productRepo.findOne({ where: { id: dto.productId } });
    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found');
    }

    // Create the order
    const order = this.ordersRepo.create({
      orderNumber: this.generateOrderNumber(),
      userId: dto.userId,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      shippingFirstName: dto.shippingFirstName,
      shippingLastName: dto.shippingLastName,
      shippingAddressLine1: dto.shippingAddressLine1,
      shippingAddressLine2: dto.shippingAddressLine2,
      shippingCity: dto.shippingCity,
      shippingState: dto.shippingState,
      shippingPostalCode: dto.shippingPostalCode,
      shippingCountry: dto.shippingCountry,
      sameAsShipping: dto.sameAsShipping ?? true,
      subtotal: dto.subtotal,
      taxAmount: dto.taxAmount ?? 0,
      shippingCost: dto.shippingCost ?? 0,
      discountAmount: dto.discountAmount ?? 0,
      totalAmount: dto.totalAmount,
      currency: dto.currency ?? 'USD',
      status: 'pending',
    });

    const savedOrder = await this.ordersRepo.save(order);

    // Create order item
    const orderItem = this.orderItemsRepo.create();
    orderItem.orderId = savedOrder.id;
    orderItem.productId = dto.productId;
    orderItem.productName = product.name;
    orderItem.productDescription = product.description ?? null;
    orderItem.productImage = product.image ?? null;
    orderItem.selectedSize = dto.selectedSize ?? null;
    orderItem.selectedColor = dto.selectedColor ?? null;
    orderItem.unitPrice = product.price;
    orderItem.quantity = dto.quantity;
    orderItem.lineTotal = product.price * dto.quantity;

    await this.orderItemsRepo.save(orderItem);

    return savedOrder;
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

    if (dto.customerEmail !== undefined) {
      order.customerEmail = dto.customerEmail;
    }

    if (dto.customerPhone !== undefined) {
      order.customerPhone = dto.customerPhone;
    }

    if (dto.shippingFirstName !== undefined) {
      order.shippingFirstName = dto.shippingFirstName;
    }

    if (dto.shippingLastName !== undefined) {
      order.shippingLastName = dto.shippingLastName;
    }

    if (dto.shippingAddressLine1 !== undefined) {
      order.shippingAddressLine1 = dto.shippingAddressLine1;
    }

    if (dto.shippingAddressLine2 !== undefined) {
      order.shippingAddressLine2 = dto.shippingAddressLine2;
    }

    if (dto.shippingCity !== undefined) {
      order.shippingCity = dto.shippingCity;
    }

    if (dto.shippingState !== undefined) {
      order.shippingState = dto.shippingState;
    }

    if (dto.shippingPostalCode !== undefined) {
      order.shippingPostalCode = dto.shippingPostalCode;
    }

    if (dto.shippingCountry !== undefined) {
      order.shippingCountry = dto.shippingCountry;
    }

    if (dto.sameAsShipping !== undefined) {
      order.sameAsShipping = dto.sameAsShipping;
    }

    if (dto.notes !== undefined) {
      order.notes = dto.notes;
    }

    if (dto.specialInstructions !== undefined) {
      order.specialInstructions = dto.specialInstructions;
    }

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

