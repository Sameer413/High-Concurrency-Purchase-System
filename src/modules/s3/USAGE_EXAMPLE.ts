/**
 * S3Service Usage Examples
 * 
 * This file demonstrates how to use the S3Service in your NestJS services.
 */

import { Injectable } from '@nestjs/common';
import { S3Service } from './s3.service';

@Injectable()
export class ExampleService {
  constructor(private readonly s3Service: S3Service) {}

  /**
   * Example 1: Upload an invoice PDF after order payment
   */
  async uploadInvoice(orderId: string, pdfBuffer: Buffer) {
    const key = `invoices/${new Date().getFullYear()}/${orderId}.pdf`;
    
    const result = await this.s3Service.uploadFile(
      key,
      pdfBuffer,
      'application/pdf',
      {
        orderId,
        generatedAt: new Date().toISOString(),
        type: 'invoice',
      }
    );

    console.log('Invoice uploaded:', result.url);
    return result;
  }

  /**
   * Example 2: Upload product image
   */
  async uploadProductImage(productId: string, imageBuffer: Buffer, mimetype: string) {
    const extension = mimetype.split('/')[1];
    const key = `products/${productId}/main.${extension}`;
    
    const result = await this.s3Service.uploadFile(
      key,
      imageBuffer,
      mimetype
    );

    return result.url;
  }

  /**
   * Example 3: Upload large file with multipart upload
   */
  async uploadLargeVideo(videoId: string, videoBuffer: Buffer) {
    const key = `videos/${videoId}.mp4`;
    
    const result = await this.s3Service.uploadLargeFile(
      key,
      videoBuffer,
      'video/mp4'
    );

    return result;
  }

  /**
   * Example 4: Download invoice
   */
  async downloadInvoice(orderId: string): Promise<Buffer> {
    const key = `invoices/${new Date().getFullYear()}/${orderId}.pdf`;
    return await this.s3Service.downloadFile(key);
  }

  /**
   * Example 5: Check if invoice exists before generating
   */
  async hasInvoice(orderId: string): Promise<boolean> {
    const key = `invoices/${new Date().getFullYear()}/${orderId}.pdf`;
    return await this.s3Service.fileExists(key);
  }

  /**
   * Example 6: List all invoices for a year
   */
  async listInvoicesForYear(year: number) {
    const files = await this.s3Service.listFiles(`invoices/${year}/`);
    
    return files.map(file => ({
      orderId: file.key.split('/').pop()?.replace('.pdf', ''),
      uploadedAt: file.lastModified,
      size: file.size,
    }));
  }

  /**
   * Example 7: Delete old invoice
   */
  async deleteInvoice(orderId: string) {
    const key = `invoices/${new Date().getFullYear()}/${orderId}.pdf`;
    await this.s3Service.deleteFile(key);
  }

  /**
   * Example 8: Get invoice metadata
   */
  async getInvoiceInfo(orderId: string) {
    const key = `invoices/${new Date().getFullYear()}/${orderId}.pdf`;
    const metadata = await this.s3Service.getFileMetadata(key);
    
    return {
      orderId,
      size: metadata.contentLength,
      uploadedAt: metadata.lastModified,
      customMetadata: metadata.metadata,
    };
  }

  /**
   * Example 9: Copy invoice to archive
   */
  async archiveInvoice(orderId: string) {
    const year = new Date().getFullYear();
    const sourceKey = `invoices/${year}/${orderId}.pdf`;
    const destKey = `archive/invoices/${year}/${orderId}.pdf`;
    
    await this.s3Service.copyFile(sourceKey, destKey);
  }

  /**
   * Example 10: Stream large file download
   */
  async streamVideo(videoId: string) {
    const key = `videos/${videoId}.mp4`;
    return await this.s3Service.getFileStream(key);
  }
}

/**
 * Integration Example: Invoice Service
 */
@Injectable()
export class InvoiceService {
  constructor(private readonly s3Service: S3Service) {}

  async generateAndUploadInvoice(orderId: string, orderData: any) {
    // 1. Check if invoice already exists
    const invoiceKey = `invoices/${orderId}.pdf`;
    const exists = await this.s3Service.fileExists(invoiceKey);
    
    if (exists) {
      console.log('Invoice already exists');
      return { exists: true, key: invoiceKey };
    }

    // 2. Generate PDF (pseudo-code)
    const pdfBuffer = await this.generatePDF(orderData);

    // 3. Upload to S3
    const result = await this.s3Service.uploadFile(
      invoiceKey,
      pdfBuffer,
      'application/pdf',
      {
        orderId,
        customerEmail: orderData.customerEmail,
        amount: orderData.totalAmount.toString(),
        generatedAt: new Date().toISOString(),
      }
    );

    console.log('Invoice uploaded:', result.url);
    return result;
  }

  async getInvoiceDownloadUrl(orderId: string): Promise<string> {
    const invoiceKey = `invoices/${orderId}.pdf`;
    
    // For local Floci
    return `http://localhost:4566/document-storage/${invoiceKey}`;
    
    // For production AWS S3, you might want to generate a signed URL
    // return await this.generateSignedUrl(invoiceKey);
  }

  private async generatePDF(orderData: any): Promise<Buffer> {
    // Implement PDF generation logic here
    // You can use libraries like pdfkit, puppeteer, etc.
    return Buffer.from('PDF content');
  }
}

/**
 * Integration Example: Product Image Upload
 */
@Injectable()
export class ProductImageService {
  constructor(private readonly s3Service: S3Service) {}

  async uploadProductImages(productId: string, images: any[]) {
    const uploadPromises = images.map(async (image, index) => {
      const key = `products/${productId}/image-${index}.${image.mimetype.split('/')[1]}`;
      
      return await this.s3Service.uploadFile(
        key,
        image.buffer,
        image.mimetype,
        {
          productId,
          imageIndex: index.toString(),
          uploadedAt: new Date().toISOString(),
        }
      );
    });

    const results = await Promise.all(uploadPromises);
    return results.map(r => r.url);
  }

  async deleteProductImages(productId: string) {
    // List all images for this product
    const files = await this.s3Service.listFiles(`products/${productId}/`);
    
    // Delete all images
    const deletePromises = files.map(file => 
      this.s3Service.deleteFile(file.key)
    );
    
    await Promise.all(deletePromises);
  }
}
