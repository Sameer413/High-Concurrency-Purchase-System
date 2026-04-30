// src/modules/cart/cart.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository } from 'typeorm';

import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { Product } from '../product/entities/product.entity';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,

    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,

    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async getOrCreateCart(userId: string): Promise<Cart> {
    let cart = await this.cartRepo.findOne({
      where: { user: { id: userId }, isActive: true },
      relations: ['items'],
    });

    if (!cart) {
      cart = this.cartRepo.create({
        user: { id: userId },
        isActive: true,
      });

      cart = await this.cartRepo.save(cart);
    }

    return cart;
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const cart = await this.getOrCreateCart(userId);

    const product = await this.productRepo.findOne({
      where: { id: dto.productId, isActive: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const existing = await this.cartItemRepo.findOne({
      where: {
        cart: { id: cart.id },
        product: { id: dto.productId },
        selectedSize: dto.selectedSize ?? undefined,
        selectedColor: dto.selectedColor ?? undefined,
      },
    });

    if (existing) {
      existing.quantity += dto.quantity;
      await this.cartItemRepo.save(existing);
    } else {
      const item = this.cartItemRepo.create({
        cart: { id: cart.id },
        product: { id: product.id },
        quantity: dto.quantity,
        selectedSize: dto.selectedSize ?? null,
        selectedColor: dto.selectedColor ?? null,
        priceSnapshot: product.price,
      });

      await this.cartItemRepo.save(item);
    }

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.getOrCreateCart(userId);

    await this.cartItemRepo.delete({
      id: itemId,
      cart: { id: cart.id },
    });

    return this.getCart(userId);
  }

  async updateQuantity(userId: string, itemId: string, quantity: number) {
    const cart = await this.getOrCreateCart(userId);

    const item = await this.cartItemRepo.findOne({
      where: {
        id: itemId,
        cart: { id: cart.id },
      },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    item.quantity = quantity;

    await this.cartItemRepo.save(item);

    return this.getCart(userId);
  }

  async getCart(userId: string) {
    const cart = await this.cartRepo.findOne({
      where: { user: { id: userId }, isActive: true },
      relations: ['items', 'items.product'],
    });

    if (!cart) {
      return {
        items: [],
        summary: {
          itemCount: 0,
          subtotal: 0,
          shipping: 0,
          tax: 0,
          grandTotal: 0,
        },
      };
    }

    const items = cart.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      selectedSize: item.selectedSize,
      selectedColor: item.selectedColor,
      price: Number(item.priceSnapshot),
      lineTotal: Number(item.priceSnapshot) * item.quantity,
      product: item.product,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    const shipping = subtotal > 999 ? 0 : 99;
    const tax = Number((subtotal * 0.18).toFixed(2));
    const grandTotal = subtotal + shipping + tax;

    return {
      items,
      summary: {
        itemCount,
        subtotal,
        shipping,
        tax,
        grandTotal,
      },
    };
  }
}
