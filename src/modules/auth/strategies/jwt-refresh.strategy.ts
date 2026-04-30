import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
    constructor(
        private readonly configService: ConfigService,
        private readonly usersService: UsersService,
    ) {
        super({
            /**
             * Refresh token extracted from:
             *  1. Authorization: Bearer <refresh_token> header
             *  2. refresh_token HTTP-only cookie
             */
            jwtFromRequest: ExtractJwt.fromExtractors([
                ExtractJwt.fromAuthHeaderAsBearerToken(),
                (req: Request): string | null => {
                    return (req?.cookies?.refresh_token as string) ?? null;
                },
            ]),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('jwt.refreshSecret') ?? '',
            passReqToCallback: true,
        });
    }

    async validate(req: Request, payload: JwtPayload) {
        // Extract raw refresh token from cookie or header
        const refreshToken =
            (req.cookies?.refresh_token as string) ??
            req.headers.authorization?.replace('Bearer ', '');

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token not provided');
        }

        const isValid = await this.usersService.validateRefreshToken(payload.sub, refreshToken);
        if (!isValid) {
            throw new UnauthorizedException('Refresh token is invalid or has been revoked');
        }

        return this.usersService.findById(payload.sub);
    }
}
