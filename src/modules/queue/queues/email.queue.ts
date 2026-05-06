import { Queue } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from '../constants/queue.constants';

@Injectable()
export class EmailQueue {
    private queue: Queue;

    constructor(private configService: ConfigService) {
        this.queue = new Queue(QUEUE_NAMES.EMAIL_NOTIFICATIONS, {
            connection: {
                host: this.configService.get('REDIS_HOST'),
                port: this.configService.get('REDIS_PORT'),
            },
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
                removeOnComplete: 100, // Keep last 100 completed jobs
                removeOnFail: 500,     // Keep last 500 failed jobs
            },
        });
    }

    getQueue(): Queue {
        return this.queue;
    }
}