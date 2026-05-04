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
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ReservationItemDTO } from './dto/reservation-item.dto';
import { ResponseService } from 'src/common/services/response-service';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { InventoryService } from '../inventory';
import { User } from '../users/entities/user.entity';

@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly responseService: ResponseService,
    private readonly inventoryService: InventoryService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateProductDto) {
    const product = await this.productService.create(dto);
    return this.responseService.success(
      product,
      'Product created successfully',
    );
  }

  @Public()
  @Get()
  async findAll(
    @Query('limit') limit?: number,
    @Query('page') page?: number,
    @Query('search') search?: string,
  ) {
    const products = await this.productService.findAll(limit, page, search);
    return this.responseService.success(
      products,
      'Products retrieved successfully',
    );
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const product = await this.productService.findOne(id);
    return this.responseService.success(
      product,
      'Product retrieved successfully',
    );
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    const product = await this.productService.update(id, dto);
    return this.responseService.success(
      product,
      'Product updated successfully',
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.productService.remove(id);
    return this.responseService.success(null, 'Product deleted successfully');
  }

  // =========================================
  // CHECK AVAILABILITY - For frontend to check stock before showing "Buy Now"
  // =========================================
  @Public()
  @Get(':id/availability')
  async getProductAvailability(@Param('id') id: string) {
    const availability = await this.productService.getProductAvailability(id);
    return this.responseService.success(
      availability,
      'Product availability retrieved successfully',
    );
  }

  // =========================================
  // BUY PRODUCT V2 - Reserves stock with multiple items
  // =========================================
  @Post('buy')
  @HttpCode(HttpStatus.OK)
  async buyV2(
    @Body('items') items: ReservationItemDTO[],
    @CurrentUser() user: User,
  ) {
    const result = await this.productService.buyV2(user.id, items);
    return this.responseService.success(
      result,
      'Reservation created successfully',
    );
  }

  // =========================================
  // GET RESERVATION - Fetch reservation details by ID
  // =========================================
  @Get('reservations/:reservationId')
  @HttpCode(HttpStatus.OK)
  async getReservation(
    @Param('reservationId') reservationId: string,
    @CurrentUser() user: User,
  ) {
    const reservation = await this.productService.getReservation(
      reservationId,
      user.id,
    );
    return this.responseService.success(
      reservation,
      'Reservation retrieved successfully',
    );
  }

  // @Public()
  // @Get('/featured')
}
