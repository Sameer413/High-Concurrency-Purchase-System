import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh.guard';
import { User } from '../users/entities/user.entity';
import { ResponseService } from '../../common/services/response-service';

@UseInterceptors(ClassSerializerInterceptor)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly responseService: ResponseService,
  ) {}

  /**
   * POST /auth/register
   * Public – create a new account
   */
  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/login
   * Public – validates credentials, returns tokens in body + sets cookies
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    console.log('here');

    const user = await this.authService.validateCredentials(
      dto.email,
      dto.password,
    );
    return this.authService.login(user, res);
  }

  /**
   * POST /auth/refresh
   * Protected by JwtRefreshAuthGuard – rotates both tokens
   * Reads refresh token from cookie OR Authorization: Bearer header
   */
  @Public()
  @UseGuards(JwtRefreshAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refresh(user, res);
  }

  /**
   * POST /auth/logout
   * Protected – clears cookies and invalidates refresh token in DB
   */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.id, res);
  }

  /**
   * GET /auth/me
   * Protected – returns the currently authenticated user
   * Works with both Bearer header and cookie
   */
  @Get('me')
  getMe(@CurrentUser() user: User) {
    return this.responseService.success(user, 'User retrieved successfully');
  }
}
