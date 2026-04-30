import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ResponseService } from 'src/common/services/response-service';
import { FavoriteService } from './favorite.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { FavoritesQueryDto } from './dto/favorites-query.dto';

@Controller('favorites')
export class FavoriteController {
  constructor(
    private readonly responseService: ResponseService,
    private readonly favoriteService: FavoriteService,
  ) {}

  @Post('toggle/:productId')
  @UseGuards(JwtAuthGuard)
  async toggleFavorite(
    @CurrentUser() user: User,
    @Param('productId') productId: string,
  ) {
    const result = await this.favoriteService.toggleFavorite(
      user.id,
      productId,
    );
    return this.responseService.success(result, result.message);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getFavorites(
    @CurrentUser() user: User,
    @Query() query: FavoritesQueryDto,
  ) {
    const favorites = await this.favoriteService.getFavorites(user.id, query);
    return this.responseService.success(
      favorites,
      'Favorites retrieved successfully',
    );
  }

  @Get('is-favorite/:productId')
  @UseGuards(JwtAuthGuard)
  async isFavorite(
    @CurrentUser() user: User,
    @Param('productId') productId: string,
  ) {
    const isFav = await this.favoriteService.getIsFavorite(user.id, productId);
    return this.responseService.success(
      { isFavorite: isFav },
      'Favorite status retrieved successfully',
    );
  }
}
