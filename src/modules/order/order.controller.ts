import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ResponseService } from 'src/common/services/response-service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly responseService: ResponseService,
  ) {}

  @Post('initiate')
  @HttpCode(HttpStatus.CREATED)
  async initiate(@Body() dto: CreateOrderDto, @CurrentUser() user: User) {
    const order = await this.orderService.create(dto, user.id);
    return this.responseService.success(order, 'Order initiated successfully');
  }

  @Get()
  async findAll(@Query('limit') limit?: number) {
    const orders = await this.orderService.findAll(limit);
    return this.responseService.success(
      orders,
      'Orders retrieved successfully',
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const order = await this.orderService.findOne(id);
    return this.responseService.success(order, 'Order retrieved successfully');
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    const order = await this.orderService.update(id, dto);
    return this.responseService.success(order, 'Order updated successfully');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.orderService.remove(id);
    return this.responseService.success(null, 'Order deleted successfully');
  }
}
