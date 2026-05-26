import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Service } from './s3.service';
import { S3Controller } from './s3.controller';
import { createS3Client } from './s3.config';

@Module({
  imports: [ConfigModule],
  controllers: [S3Controller],
  providers: [
    {
      provide: 'S3Client',
      useFactory: (configService: ConfigService) => {
        return createS3Client(configService);
      },
      inject: [ConfigService],
    },
    S3Service,
  ],
  exports: [S3Service],
})
export class S3Module {}
