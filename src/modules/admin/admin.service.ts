import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { Product } from '../product/entities/product.entity';
import { Order } from '../order/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { S3Service } from '../s3/s3.service';
import { CreateProductDto } from '../product/dto/create-product.dto';
import { UpdateProductDto } from '../product/dto/update-product.dto';
import { ProductService } from '../product/product.service';
import { Role } from 'src/common/enums/role.enum';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly s3Service: S3Service,
    private readonly productService: ProductService,
  ) {}

  // =========================================
  // DASHBOARD ANALYTICS
  // =========================================
  async getDashboardStats() {
    const [totalRevenue, totalOrders, totalCustomers, totalProducts] = await Promise.all([
      this.orderRepo
        .createQueryBuilder('order')
        .select('SUM(order.totalAmount)', 'total')
        .where('order.status = :status', { status: 'PAID' })
        .getRawOne(),
      this.orderRepo.count(),
      this.userRepo
        .createQueryBuilder('user')
        .where(':role = ANY(user.roles)', { role: 'user' })
        .getCount(),
      this.productRepo.count({ where: { isActive: true } }),
    ]);

    return {
      totalRevenue: parseFloat(totalRevenue?.total || '0'),
      totalOrders,
      totalCustomers,
      totalProducts,
    };
  }

  async getSalesChart(period: string = 'month') {
    // Mock data for now - implement actual logic based on your needs
    const data = [
      { period: 'Jan', sales: 4000 },
      { period: 'Feb', sales: 3000 },
      { period: 'Mar', sales: 5000 },
      { period: 'Apr', sales: 4500 },
      { period: 'May', sales: 6000 },
      { period: 'Jun', sales: 5500 },
    ];

    return data;
  }

  async getTopProducts(limit: number = 5) {
    // Mock data for now - implement actual logic with order items
    return this.productRepo.find({
      take: limit,
      order: { rating: 'DESC' },
    });
  }

  // =========================================
  // PRODUCT MANAGEMENT
  // =========================================
  async createProduct(dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  async getAllProducts(filters: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    status?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.search) {
      where.name = Like(`%${filters.search}%`);
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.status === 'active') {
      where.isActive = true;
    } else if (filters.status === 'inactive') {
      where.isActive = false;
    }

    const [products, total] = await this.productRepo.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getProduct(id: string) {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const product = await this.getProduct(id);
    Object.assign(product, dto);
    return this.productRepo.save(product);
  }

  async deleteProduct(id: string) {
    const product = await this.getProduct(id);
    
    // Delete product image from S3 if exists
    if (product.image) {
      try {
        const key = product.image.split('/').slice(-2).join('/'); // Extract key from URL
        await this.s3Service.deleteFile(key);
      } catch (error) {
        // Log error but don't fail the deletion
        console.error('Failed to delete product image:', error);
      }
    }

    await this.productRepo.remove(product);
  }

  // =========================================
  // PRODUCT IMAGE UPLOAD (Signed URL)
  // =========================================
  async generateProductImageUploadUrl(fileName: string, contentType: string) {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `products/${timestamp}-${sanitizedFileName}`;

    const { uploadUrl, expiresIn } = await this.s3Service.generateUploadUrl(
      key,
      300, // 5 minutes
      contentType,
    );

    // Generate the final URL that will be stored in the database
    const endpoint = process.env.AWS_S3_ENDPOINT;
    const bucketName = process.env.AWS_S3_BUCKET || 'document-storage';
    const region = process.env.AWS_S3_REGION || 'us-east-1';
    
    const finalUrl = endpoint
      ? `${endpoint}/${bucketName}/${key}`
      : `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

    return {
      uploadUrl,
      key,
      finalUrl,
      expiresIn,
    };
  }

  // =========================================
  // ORDER MANAGEMENT
  // =========================================
  async getAllOrders(filters: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .skip(skip)
      .take(limit)
      .orderBy('order.createdAt', 'DESC');

    if (filters.status) {
      queryBuilder.andWhere('order.status = :status', { status: filters.status });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(order.orderNumber LIKE :search OR user.email LIKE :search OR user.firstName LIKE :search OR user.lastName LIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    const [orders, total] = await queryBuilder.getManyAndCount();

    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOrder(id: string) {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: ['user', 'items'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateOrderStatus(id: string, status: string) {
    const order = await this.getOrder(id);
    order.status = status as any;
    return this.orderRepo.save(order);
  }

  // =========================================
  // USER MANAGEMENT
  // =========================================
  async getAllUsers(filters: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.search) {
      where.email = Like(`%${filters.search}%`);
    }

    const [users, total] = await this.userRepo.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
      select: ['id', 'email', 'firstName', 'lastName', 'roles', 'createdAt', 'updatedAt'],
    });

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUser(id: string) {
    const user = await this.userRepo.findOne({
      where: { id },
      select: ['id', 'email', 'firstName', 'lastName', 'roles', 'createdAt', 'updatedAt'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateUserStatus(id: string, status: string) {
    const user = await this.getUser(id);
    // Implement status logic based on your User entity
    return this.userRepo.save(user);
  }

  async updateUserRole(id: string, role: string) {
    const user = await this.getUser(id);
    // Update roles array - replace with single role or add to existing
    user.roles = [role as Role];
    return this.userRepo.save(user);
  }

  // =========================================
  // REFUND MANAGEMENT (Mock for now)
  // =========================================
  async getAllRefunds(filters: { page?: number; limit?: number; status?: string }) {
    // Mock data - implement actual refund entity and logic
    return {
      refunds: [],
      total: 0,
      page: filters.page || 1,
      limit: filters.limit || 20,
      totalPages: 0,
    };
  }

  async getRefund(id: string) {
    throw new NotFoundException('Refund not found');
  }

  async approveRefund(id: string) {
    throw new NotFoundException('Refund not found');
  }

  async rejectRefund(id: string, reason?: string) {
    throw new NotFoundException('Refund not found');
  }

  async processRefund(id: string) {
    throw new NotFoundException('Refund not found');
  }
}
