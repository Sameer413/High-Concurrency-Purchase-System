import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service'
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
    providers: [
        {
            provide: REDIS_CLIENT,
            useFactory: (configService: ConfigService) => {
                const host = configService.get<string>('redis.host', 'wanted-katydid-70825.upstash.io');
                const port = configService.get<number>('redis.port', 6379);
                const password = configService.get<string>('redis.password', 'gQAAAAAAARSpAAIgcDE4NGYwNGEyMzI1Zjc0MzBhOGQ4Mjc1YzRkOWVhNTI1OA');
                const tlsEnabled = configService.get<boolean>('redis.tls', true);

                const client = new Redis({
                    host,
                    port,
                    password: password || undefined,
                    tls: tlsEnabled ? {} : undefined,
                });

                client.on('error', (err) => {
                    console.error('Redis Client Error:', err);
                });

                client.on('connect', () => {
                    console.log(`🔌 Redis connected to ${host}:${port}`);
                });

                return client;
            },
            inject: [ConfigService],
        },
        RedisService,
    ],
    exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule { }
