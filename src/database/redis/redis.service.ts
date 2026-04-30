import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService {
    constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) { }

    /**
     * Gets a value from Redis
     */
    async get(key: string): Promise<string | null> {
        return this.redisClient.get(key);
    }

    /**
     * Sets a value in Redis with an optional expiration time in seconds
     */
    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds) {
            await this.redisClient.set(key, value, 'EX', ttlSeconds);
        } else {
            await this.redisClient.set(key, value);
        }
    }

    /**
     * Deletes a value from Redis
     */
    async del(key: string): Promise<number> {
        return this.redisClient.del(key);
    }

    /**
     * Acquires a lock for a specific key
     * Implementing the 'NX' (Not eXists) and 'EX' (Expiration) logic
     * @returns boolean true if lock was acquired, false otherwise
     */
    async acquireLock(key: string, value: string, ttlSeconds: number): Promise<boolean> {
        // 'NX' ensures we only set if it does not exist
        // 'EX' ensures the lock expires automatically to prevent deadlocks
        const result = await this.redisClient.set(key, value, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    }

    /**
     * Safely release a lock ONLY if the value matches what we set it to.
     * This prevents a delayed process from releasing a lock that expired and was acquired by another process.
     */
    async releaseLock(key: string, value: string): Promise<boolean> {
        // Lua script to check if the value matches before deleting
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        const result = await this.redisClient.eval(script, 1, key, value);
        return result === 1;
    }

    /**
     * Get raw client if needed for complex transactions or features
     */
    getClient(): Redis {
        return this.redisClient;
    }
}
