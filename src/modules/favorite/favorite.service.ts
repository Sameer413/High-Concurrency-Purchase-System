import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Favorite } from './entities/favorite.entity';
import { Repository } from 'typeorm';
import { Product } from '../product/entities/product.entity';
import { FavoritesQueryDto } from './dto/favorites-query.dto';

@Injectable()
export class FavoriteService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async toggleFavorite(
    userId: string,
    productId: string,
  ): Promise<{ isFavorite: boolean; message: string }> {
    const product = await this.productRepo.findOne({
      where: { id: productId },
      select: ['id'],
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const existing = await this.favoriteRepo.findOne({
      where: {
        user: { id: userId },
        product: { id: productId },
      },
    });

    if (existing) {
      await this.favoriteRepo.remove(existing);

      return {
        isFavorite: false,
        message: 'Removed from favorites',
      };
    }

    const favorite = this.favoriteRepo.create({
      user: { id: userId },
      product: { id: productId },
    });

    await this.favoriteRepo.save(favorite);

    return {
      isFavorite: true,
      message: 'Added to favorites',
    };
  }

  async getFavorites(userId: string, query: FavoritesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.favoriteRepo
      .createQueryBuilder('favorite')
      .leftJoinAndSelect('favorite.product', 'product')
      .where('favorite.user_id = :userId', {
        userId,
      });

    switch (query.sort) {
      case 'price_asc':
        qb.orderBy('product.price', 'ASC');
        break;

      case 'price_desc':
        qb.orderBy('product.price', 'DESC');
        break;

      case 'name_asc':
        qb.orderBy('product.name', 'ASC');
        break;

      case 'name_desc':
        qb.orderBy('product.name', 'DESC');
        break;

      case 'oldest':
        qb.orderBy('favorite.createdAt', 'ASC');
        break;

      default:
        qb.orderBy('favorite.createdAt', 'DESC');
    }

    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async getIsFavorite(userId: string, productId: string): Promise<boolean> {
    const favorite = await this.favoriteRepo.findOne({
      where: {
        user: { id: userId },
        product: { id: productId },
      },
    });

    return !!favorite;
  }
}
