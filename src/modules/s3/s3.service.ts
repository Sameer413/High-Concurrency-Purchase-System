import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Injectable, Logger, InternalServerErrorException, NotFoundException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject('S3Client') s3Client: S3Client,
  ) {
    this.s3Client = s3Client;
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET', 'document-storage');
  }

  /**
   * Upload a file to S3
   * @param key - File path/name in S3 (e.g., 'invoices/invoice-123.pdf')
   * @param body - File content (Buffer, string, or Readable stream)
   * @param contentType - MIME type (e.g., 'application/pdf', 'image/jpeg')
   * @param metadata - Optional metadata key-value pairs
   */
  async uploadFile(
    key: string,
    body: Buffer | string | Readable,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<{ key: string; url: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      });

      await this.s3Client.send(command);

      const url = this.getFileUrl(key);
      this.logger.log(`File uploaded successfully: ${key}`);

      return { key, url };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${key}`, error.stack);
      throw new InternalServerErrorException('Failed to upload file to S3');
    }
  }

  /**
   * Upload large file with multipart upload (for files > 5MB)
   * @param key - File path/name in S3
   * @param body - File content (Buffer or Readable stream)
   * @param contentType - MIME type
   */
  async uploadLargeFile(
    key: string,
    body: Buffer | Readable,
    contentType: string,
  ): Promise<{ key: string; url: string }> {
    try {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: body,
          ContentType: contentType,
        },
        queueSize: 4, // Concurrent parts
        partSize: 5 * 1024 * 1024, // 5MB per part
      });

      await upload.done();

      const url = this.getFileUrl(key);
      this.logger.log(`Large file uploaded successfully: ${key}`);

      return { key, url };
    } catch (error) {
      this.logger.error(`Failed to upload large file: ${key}`, error.stack);
      throw new InternalServerErrorException('Failed to upload large file to S3');
    }
  }

  /**
   * Download a file from S3
   * @param key - File path/name in S3
   * @returns File content as Buffer
   */
  async downloadFile(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      // Convert stream to buffer
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        throw new NotFoundException(`File not found: ${key}`);
      }
      this.logger.error(`Failed to download file: ${key}`, error.stack);
      throw new InternalServerErrorException('Failed to download file from S3');
    }
  }

  /**
   * Get a readable stream for a file (useful for large files)
   * @param key - File path/name in S3
   * @returns Readable stream
   */
  async getFileStream(key: string): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      return response.Body as Readable;
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        throw new NotFoundException(`File not found: ${key}`);
      }
      this.logger.error(`Failed to get file stream: ${key}`, error.stack);
      throw new InternalServerErrorException('Failed to get file stream from S3');
    }
  }

  /**
   * Delete a file from S3
   * @param key - File path/name in S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${key}`, error.stack);
      throw new InternalServerErrorException('Failed to delete file from S3');
    }
  }

  /**
   * Check if a file exists in S3
   * @param key - File path/name in S3
   * @returns true if file exists, false otherwise
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }

  /**
   * List all files in a folder (prefix)
   * @param prefix - Folder path (e.g., 'invoices/')
   * @param maxKeys - Maximum number of files to return (default: 1000)
   */
  async listFiles(prefix?: string, maxKeys: number = 1000): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.s3Client.send(command);

      return (response.Contents || []).map((item) => ({
        key: item.Key!,
        size: item.Size!,
        lastModified: item.LastModified!,
      }));
    } catch (error) {
      this.logger.error(`Failed to list files with prefix: ${prefix}`, error.stack);
      throw new InternalServerErrorException('Failed to list files from S3');
    }
  }

  /**
   * Copy a file within S3
   * @param sourceKey - Source file path
   * @param destinationKey - Destination file path
   */
  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      const command = new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${sourceKey}`,
        Key: destinationKey,
      });

      await this.s3Client.send(command);
      this.logger.log(`File copied: ${sourceKey} -> ${destinationKey}`);
    } catch (error) {
      this.logger.error(`Failed to copy file: ${sourceKey} -> ${destinationKey}`, error.stack);
      throw new InternalServerErrorException('Failed to copy file in S3');
    }
  }

  /**
   * Get file metadata
   * @param key - File path/name in S3
   */
  async getFileMetadata(key: string): Promise<{
    contentType: string;
    contentLength: number;
    lastModified: Date;
    metadata: Record<string, string>;
  }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        contentType: response.ContentType!,
        contentLength: response.ContentLength!,
        lastModified: response.LastModified!,
        metadata: response.Metadata || {},
      };
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
        throw new NotFoundException(`File not found: ${key}`);
      }
      this.logger.error(`Failed to get file metadata: ${key}`, error.stack);
      throw new InternalServerErrorException('Failed to get file metadata from S3');
    }
  }

  /**
   * Get public URL for a file (works with Floci local endpoint)
   * @param key - File path/name in S3
   */
  private getFileUrl(key: string): string {
    const endpoint = this.configService.get<string>('AWS_S3_ENDPOINT');
    
    if (endpoint) {
      // Local development (Floci)
      return `${endpoint}/${this.bucketName}/${key}`;
    } else {
      // Production (real AWS S3)
      const region = this.configService.get<string>('AWS_S3_REGION', 'us-east-1');
      return `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;
    }
  }

  /**
   * Get the bucket name (useful for debugging)
   */
  getBucketName(): string {
    return this.bucketName;
  }

  /**
   * Generate a presigned URL for uploading a file
   * @param key - File path/name in S3
   * @param expiresIn - URL expiration time in seconds (default: 300 = 5 minutes)
   * @param contentType - MIME type of the file to be uploaded
   */
  async generateUploadUrl(
    key: string,
    expiresIn: number = 300,
    contentType?: string,
  ): Promise<{ uploadUrl: string; key: string; expiresIn: number }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

      this.logger.log(`Generated upload URL for: ${key}`);

      return {
        uploadUrl,
        key,
        expiresIn,
      };
    } catch (error) {
      this.logger.error(`Failed to generate upload URL: ${key}`, error.stack);
      throw new InternalServerErrorException('Failed to generate upload URL');
    }
  }

  /**
   * Generate a presigned URL for downloading a file
   * @param key - File path/name in S3
   * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
   */
  async generateDownloadUrl(
    key: string,
    expiresIn: number = 3600,
  ): Promise<{ downloadUrl: string; key: string; expiresIn: number }> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const downloadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

      this.logger.log(`Generated download URL for: ${key}`);

      return {
        downloadUrl,
        key,
        expiresIn,
      };
    } catch (error) {
      this.logger.error(`Failed to generate download URL: ${key}`, error.stack);
      throw new InternalServerErrorException('Failed to generate download URL');
    }
  }

  /**
   * Generate multiple presigned upload URLs (for batch uploads)
   * @param keys - Array of file paths
   * @param expiresIn - URL expiration time in seconds
   */
  async generateBatchUploadUrls(
    keys: string[],
    expiresIn: number = 300,
  ): Promise<Array<{ uploadUrl: string; key: string }>> {
    const promises = keys.map((key) => this.generateUploadUrl(key, expiresIn));
    const results = await Promise.all(promises);
    return results.map((r) => ({ uploadUrl: r.uploadUrl, key: r.key }));
  }
}
