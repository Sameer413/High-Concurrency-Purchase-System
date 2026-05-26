import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

export const createS3Client = (configService: ConfigService): S3Client => {
  const endpoint = configService.get<string>('AWS_S3_ENDPOINT');
  const region = configService.get<string>('AWS_S3_REGION', 'us-east-1');
  const forcePathStyle = configService.get<string>('AWS_S3_FORCE_PATH_STYLE') === 'true';

  const config: any = {
    region,
    credentials: {
      accessKeyId: configService.get<string>('AWS_ACCESS_KEY_ID', 'test'),
      secretAccessKey: configService.get<string>('AWS_SECRET_ACCESS_KEY', 'test'),
    },
    forcePathStyle, // Required for local S3 (Floci/LocalStack)
  };

  // Only set endpoint for local development (Floci)
  if (endpoint) {
    config.endpoint = endpoint;
  }

  return new S3Client(config);
};
