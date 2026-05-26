import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Res,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { S3Service } from './s3.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('s3')
@Public() // Make all S3 endpoints public for testing
export class S3Controller {
  constructor(private readonly s3Service: S3Service) {}

  /**
   * Test endpoint: Upload a file
   * POST /s3/upload
   * Body: multipart/form-data with 'file' field
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const key = `uploads/${Date.now()}-${file.originalname}`;
    const result = await this.s3Service.uploadFile(
      key,
      file.buffer,
      file.mimetype,
      {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
      },
    );

    return {
      message: 'File uploaded successfully',
      ...result,
    };
  }

  /**
   * Test endpoint: Download a file
   * GET /s3/download/:key
   */
  @Get('download/*')
  async downloadFile(@Param('0') key: string, @Res() res: Response) {
    const fileBuffer = await this.s3Service.downloadFile(key);
    const metadata = await this.s3Service.getFileMetadata(key);

    res.set({
      'Content-Type': metadata.contentType,
      'Content-Length': metadata.contentLength,
      'Content-Disposition': `attachment; filename="${key.split('/').pop()}"`,
    });

    res.send(fileBuffer);
  }

  /**
   * Test endpoint: Delete a file
   * DELETE /s3/:key
   */
  @Delete('*')
  async deleteFile(@Param('0') key: string) {
    await this.s3Service.deleteFile(key);
    return {
      message: 'File deleted successfully',
      key,
    };
  }

  /**
   * Test endpoint: List all files
   * GET /s3/list
   */
  @Get('list')
  async listFiles() {
    const files = await this.s3Service.listFiles();
    return {
      count: files.length,
      files,
    };
  }

  /**
   * Test endpoint: Check if file exists
   * GET /s3/exists/:key
   */
  @Get('exists/*')
  async fileExists(@Param('0') key: string) {
    const exists = await this.s3Service.fileExists(key);
    return {
      key,
      exists,
    };
  }

  /**
   * Test endpoint: Get file metadata
   * GET /s3/metadata/:key
   */
  @Get('metadata/*')
  async getMetadata(@Param('0') key: string) {
    const metadata = await this.s3Service.getFileMetadata(key);
    return {
      key,
      ...metadata,
    };
  }

  /**
   * Test endpoint: Simple text upload
   * POST /s3/test
   */
  @Post('test')
  async testUpload() {
    const key = `test/sample-${Date.now()}.txt`;
    const result = await this.s3Service.uploadFile(
      key,
      Buffer.from('Hello from NestJS!'),
      'text/plain',
    );

    return {
      message: 'Test file uploaded successfully',
      ...result,
    };
  }
}
