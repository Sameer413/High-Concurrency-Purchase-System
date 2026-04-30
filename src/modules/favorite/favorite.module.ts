import { Module } from '@nestjs/common';
import { FavoriteController } from './favorite.controller';
import { FavoriteService } from './favorite.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Favorite } from './entities/favorite.entity';
import { CommonModule } from 'src/common/common.module';
import { Product } from '../product/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Favorite, Product]), CommonModule],
  controllers: [FavoriteController],
  providers: [FavoriteService],
  exports: [FavoriteService, TypeOrmModule],
})
export class FavoriteModule {}
