import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import {
  ReserveStockDto,
  ReleaseReservationDto,
  ConfirmSaleDto,
  RestockDto,
} from './dto/inventory.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * Get inventory for a specific product
   * Public endpoint - anyone can check stock levels
   */
  @Public()
  @Get('product/:productId')
  async getByProductId(@Param('productId', ParseUUIDPipe) productId: string) {
    return await this.inventoryService.getByProductId(productId);
  }

  /**
   * Check if stock is available
   * Public endpoint
   */
  @Public()
  @Get('product/:productId/availability')
  async checkAvailability(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('quantity', ParseIntPipe) quantity: number,
  ) {
    const available = await this.inventoryService.checkAvailability(
      productId,
      quantity,
    );
    return { available, quantity };
  }

  /**
   * Get low stock items
   * Admin only
   */
  @Roles(Role.ADMIN)
  @Get('low-stock')
  async getLowStockItems(
    @Query('threshold', new ParseIntPipe({ optional: true }))
    threshold?: number,
  ) {
    return await this.inventoryService.getLowStockItems(threshold);
  }

  /**
   * Get inventory statistics
   * Admin only
   */
  @Roles(Role.ADMIN)
  @Get('statistics')
  async getStatistics() {
    return await this.inventoryService.getStatistics();
  }

  /**
   * Reserve stock
   * Admin only (in production, this would be called internally by order service)
   */
  @Roles(Role.ADMIN)
  @Post('product/:productId/reserve')
  async reserveStock(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ReserveStockDto,
  ) {
    return await this.inventoryService.reserveStock(productId, dto.quantity);
  }

  /**
   * Release reservation
   * Admin only
   */
  @Roles(Role.ADMIN)
  @Post('product/:productId/release')
  async releaseReservation(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ReleaseReservationDto,
  ) {
    return await this.inventoryService.releaseReservation(
      productId,
      dto.quantity,
    );
  }

  /**
   * Confirm sale
   * Admin only
   */
  @Roles(Role.ADMIN)
  @Post('product/:productId/confirm-sale')
  async confirmSale(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ConfirmSaleDto,
  ) {
    return await this.inventoryService.confirmSale(productId, dto.quantity);
  }

  /**
   * Restock product
   * Admin only
   */
  @Roles(Role.ADMIN)
  @Post('product/:productId/restock')
  async restock(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: RestockDto,
  ) {
    return await this.inventoryService.restock(productId, dto.quantity);
  }
}
