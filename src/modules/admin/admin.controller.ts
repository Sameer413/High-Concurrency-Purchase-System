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
import { AdminService } from './admin.service';
import { ResponseService } from 'src/common/services/response-service';
import { CreateProductDto } from '../product/dto/create-product.dto';
import { UpdateProductDto } from '../product/dto/update-product.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';

@Controller('admin')
@Roles(Role.ADMIN) // Require admin role for all endpoints
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly responseService: ResponseService,
  ) {}

  // =========================================
  // DASHBOARD ANALYTICS
  // =========================================
  @Get('dashboard/stats')
  async getDashboardStats() {
    const stats = await this.adminService.getDashboardStats();
    return this.responseService.success(stats, 'Dashboard stats retrieved successfully');
  }

  @Get('dashboard/sales-chart')
  async getSalesChart(@Query('period') period?: string) {
    const data = await this.adminService.getSalesChart(period);
    return this.responseService.success(data, 'Sales chart data retrieved successfully');
  }

  @Get('dashboard/top-products')
  async getTopProducts(@Query('limit') limit?: number) {
    const products = await this.adminService.getTopProducts(limit);
    return this.responseService.success(products, 'Top products retrieved successfully');
  }

  // =========================================
  // PRODUCT MANAGEMENT
  // =========================================
  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  async createProduct(@Body() dto: CreateProductDto) {
    const product = await this.adminService.createProduct(dto);
    return this.responseService.success(product, 'Product created successfully');
  }

  @Get('products')
  async getAllProducts(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    const products = await this.adminService.getAllProducts({
      page,
      limit,
      search,
      category,
      status,
    });
    return this.responseService.success(products, 'Products retrieved successfully');
  }

  @Get('products/:id')
  async getProduct(@Param('id') id: string) {
    const product = await this.adminService.getProduct(id);
    return this.responseService.success(product, 'Product retrieved successfully');
  }

  @Patch('products/:id')
  async updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    const product = await this.adminService.updateProduct(id, dto);
    return this.responseService.success(product, 'Product updated successfully');
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.OK)
  async deleteProduct(@Param('id') id: string) {
    await this.adminService.deleteProduct(id);
    return this.responseService.success(null, 'Product deleted successfully');
  }

  // =========================================
  // PRODUCT IMAGE UPLOAD (Signed URL)
  // =========================================
  @Post('products/upload-url')
  @HttpCode(HttpStatus.OK)
  async generateProductUploadUrl(
    @Body('fileName') fileName: string,
    @Body('contentType') contentType: string,
  ) {
    const result = await this.adminService.generateProductImageUploadUrl(fileName, contentType);
    return this.responseService.success(result, 'Upload URL generated successfully');
  }

  // =========================================
  // ORDER MANAGEMENT
  // =========================================
  @Get('orders')
  async getAllOrders(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const orders = await this.adminService.getAllOrders({ page, limit, status, search });
    return this.responseService.success(orders, 'Orders retrieved successfully');
  }

  @Get('orders/:id')
  async getOrder(@Param('id') id: string) {
    const order = await this.adminService.getOrder(id);
    return this.responseService.success(order, 'Order retrieved successfully');
  }

  @Patch('orders/:id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    const order = await this.adminService.updateOrderStatus(id, status);
    return this.responseService.success(order, 'Order status updated successfully');
  }

  // =========================================
  // USER MANAGEMENT
  // =========================================
  @Get('users')
  async getAllUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const users = await this.adminService.getAllUsers({ page, limit, status, search });
    return this.responseService.success(users, 'Users retrieved successfully');
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    const user = await this.adminService.getUser(id);
    return this.responseService.success(user, 'User retrieved successfully');
  }

  @Patch('users/:id/status')
  async updateUserStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    const user = await this.adminService.updateUserStatus(id, status);
    return this.responseService.success(user, 'User status updated successfully');
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @Param('id') id: string,
    @Body('role') role: string,
  ) {
    const user = await this.adminService.updateUserRole(id, role);
    return this.responseService.success(user, 'User role updated successfully');
  }

  // =========================================
  // REFUND MANAGEMENT
  // =========================================
  @Get('refunds')
  async getAllRefunds(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    const refunds = await this.adminService.getAllRefunds({ page, limit, status });
    return this.responseService.success(refunds, 'Refunds retrieved successfully');
  }

  @Get('refunds/:id')
  async getRefund(@Param('id') id: string) {
    const refund = await this.adminService.getRefund(id);
    return this.responseService.success(refund, 'Refund retrieved successfully');
  }

  @Patch('refunds/:id/approve')
  async approveRefund(@Param('id') id: string) {
    const refund = await this.adminService.approveRefund(id);
    return this.responseService.success(refund, 'Refund approved successfully');
  }

  @Patch('refunds/:id/reject')
  async rejectRefund(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    const refund = await this.adminService.rejectRefund(id, reason);
    return this.responseService.success(refund, 'Refund rejected successfully');
  }

  @Post('refunds/:id/process')
  async processRefund(@Param('id') id: string) {
    const refund = await this.adminService.processRefund(id);
    return this.responseService.success(refund, 'Refund processed successfully');
  }
}
