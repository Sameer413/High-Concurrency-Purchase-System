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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ReservationItemDTO } from './dto/reservation-item.dto';
import { GetProductsQueryDto } from './dto/get-products-query.dto';
import { ResponseService } from 'src/common/services/response-service';
import { Public } from 'src/common/decorators/public.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { InventoryService } from '../inventory';
import { User } from '../users/entities/user.entity';
import { S3Service } from '../s3/s3.service';

@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly responseService: ResponseService,
    private readonly inventoryService: InventoryService,
    private readonly s3Service: S3Service,
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

  // =========================================
  // CREATE PRODUCT V2 - With Image Upload to S3
  // =========================================
  @Post('v2')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('image'))
  async createV2(
    @Body() dto: CreateProductDto,
    @UploadedFile() image?: any,
  ) {
    let imageUrl: string | null = null;

    // Upload image to S3 if provided
    if (image) {
      const key = `products/${Date.now()}-${image.originalname}`;
      const result = await this.s3Service.uploadFile(
        key,
        image.buffer,
        image.mimetype,
        {
          productName: dto.name,
          uploadedAt: new Date().toISOString(),
        },
      );
      imageUrl = result.url;
    }

    // Create product with image URL
    const product = await this.productService.create({
      ...dto,
      image: imageUrl,
    });

    return this.responseService.success(
      product,
      'Product created successfully with image',
    );
  }

  @Public()
  @Get()
  async findAll(@Query() query: GetProductsQueryDto) {
    const products = await this.productService.findAll(query);
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
