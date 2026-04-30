// src/modules/cart/cart.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ResponseService } from 'src/common/services/response-service';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly responseService: ResponseService,
  ) {}

  @Get()
  async getCart(@Req() req: AuthenticatedRequest) {
    const cart = await this.cartService.getCart(req.user.id);
    return this.responseService.success(cart, 'Cart retrieved successfully');
  }

  @Post('items')
  async addItem(@Req() req: AuthenticatedRequest, @Body() dto: AddCartItemDto) {
    const cart = await this.cartService.addItem(req.user.id, dto);
    return this.responseService.success(cart, 'Item added to cart');
  }

  @Delete('items/:itemId')
  async removeItem(@Req() req: AuthenticatedRequest, @Param('itemId') itemId: string) {
    const cart = await this.cartService.removeItem(req.user.id, itemId);
    return this.responseService.success(cart, 'Item removed from cart');
  }

  @Patch('items/:itemId')
  async updateQty(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body('quantity') quantity: number,
  ) {
    const cart = await this.cartService.updateQuantity(req.user.id, itemId, quantity);
    return this.responseService.success(cart, 'Cart updated successfully');
  }
}
