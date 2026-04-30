import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'pg';

async function ensureDatabaseExists(config: ConfigService): Promise<void> {
    const dbName = config.get<string>('database.database');
    const host = config.get<string>('database.host');
    const port = config.get<number>('database.port');
    const username = config.get<string>('database.username');
    const password = config.get<string>('database.password');

    if (!dbName) {
        return;
    }

    const client = new Client({
        host,
        port,
        user: username,
        password,
        database: 'postgres',
    });

    try {
        await client.connect();

        const result = await client.query(
            'SELECT 1 FROM pg_database WHERE datname = $1',
            [dbName],
        );

        if (result.rowCount === 0) {
            await client.query(`CREATE DATABASE "${dbName}"`);
        }
    } catch (error) {
        // If we can't create the database, let TypeORM handle the failure as before.
        // You can replace this with a proper logger if desired.
        // eslint-disable-next-line no-console
        console.error('Failed to ensure database exists:', error);
    } finally {
        await client.end().catch(() => undefined);
    }
}

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (config: ConfigService) => {
                await ensureDatabaseExists(config);

                return {
                    type: 'postgres',
                    host: config.get<string>('database.host'),
                    port: config.get<number>('database.port'),
                    username: config.get<string>('database.username'),
                    password: config.get<string>('database.password'),
                    database: config.get<string>('database.database'),
                    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
                    synchronize: config.get<string>('nodeEnv') !== 'production',
                    // logging: config.get<string>('nodeEnv') === 'development',
                    logging: false,
                    ssl:
                        config.get<string>('nodeEnv') === 'production'
                            ? { rejectUnauthorized: false }
                            : false,
                };
            },
        }),
    ],
})
export class DatabaseModule { }
