# S3 Module - NestJS

This module provides AWS S3 integration for file storage, supporting both local development (Floci) and production (AWS S3).

## Features

- ✅ Upload files (small and large with multipart)
- ✅ Download files (buffer or stream)
- ✅ Delete files
- ✅ List files in bucket/folder
- ✅ Check file existence
- ✅ Get file metadata
- ✅ Copy files within bucket
- ✅ Local development with Floci
- ✅ Production-ready for AWS S3

## Installation

```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
```

## Configuration

### Environment Variables

Add to `server/.env`:

```env
# Local Development (Floci)
AWS_S3_ENDPOINT=http://localhost:4566
AWS_S3_REGION=us-east-1
AWS_S3_BUCKET=document-storage
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_S3_FORCE_PATH_STYLE=true
```

### Production (AWS S3)

```env
# Production
AWS_S3_ENDPOINT=  # Leave empty
AWS_S3_REGION=us-east-1
AWS_S3_BUCKET=your-production-bucket
AWS_ACCESS_KEY_ID=your-real-access-key
AWS_SECRET_ACCESS_KEY=your-real-secret-key
AWS_S3_FORCE_PATH_STYLE=false
```

## Module Import

Add to `app.module.ts`:

```typescript
import { S3Module } from './modules/s3/s3.module';

@Module({
  imports: [
    // ... other imports
    S3Module,
  ],
})
export class AppModule {}
```

## Usage Examples

### 1. Upload a File

```typescript
import { S3Service } from './modules/s3/s3.service';

@Injectable()
export class InvoiceService {
  constructor(private readonly s3Service: S3Service) {}

  async generateInvoice(orderId: string) {
    const pdfBuffer = await this.createInvoicePDF(orderId);
    
    const result = await this.s3Service.uploadFile(
      `invoices/${orderId}.pdf`,
      pdfBuffer,
      'application/pdf',
      {
        orderId,
        generatedAt: new Date().toISOString(),
      }
    );
    
    return result; // { key, url }
  }
}
```

### 2. Upload Large File (Multipart)

```typescript
async uploadProductImage(file: Express.Multer.File) {
  const key = `products/${Date.now()}-${file.originalname}`;
  
  const result = await this.s3Service.uploadLargeFile(
    key,
    file.buffer,
    file.mimetype
  );
  
  return result;
}
```

### 3. Download a File

```typescript
async downloadInvoice(orderId: string) {
  const key = `invoices/${orderId}.pdf`;
  const fileBuffer = await this.s3Service.downloadFile(key);
  
  return fileBuffer;
}
```

### 4. Stream a File (for large files)

```typescript
async streamVideo(videoId: string, res: Response) {
  const key = `videos/${videoId}.mp4`;
  const stream = await this.s3Service.getFileStream(key);
  
  stream.pipe(res);
}
```

### 5. Delete a File

```typescript
async deleteInvoice(orderId: string) {
  const key = `invoices/${orderId}.pdf`;
  await this.s3Service.deleteFile(key);
}
```

### 6. Check if File Exists

```typescript
async hasInvoice(orderId: string): Promise<boolean> {
  const key = `invoices/${orderId}.pdf`;
  return await this.s3Service.fileExists(key);
}
```

### 7. List Files in Folder

```typescript
async listInvoices() {
  const files = await this.s3Service.listFiles('invoices/');
  
  return files.map(file => ({
    filename: file.key,
    size: file.size,
    uploadedAt: file.lastModified,
  }));
}
```

### 8. Get File Metadata

```typescript
async getInvoiceInfo(orderId: string) {
  const key = `invoices/${orderId}.pdf`;
  const metadata = await this.s3Service.getFileMetadata(key);
  
  return {
    contentType: metadata.contentType,
    size: metadata.contentLength,
    lastModified: metadata.lastModified,
    customMetadata: metadata.metadata,
  };
}
```

### 9. Copy a File

```typescript
async duplicateInvoice(orderId: string, newOrderId: string) {
  await this.s3Service.copyFile(
    `invoices/${orderId}.pdf`,
    `invoices/${newOrderId}.pdf`
  );
}
```

## API Endpoints (Test Controller)

The module includes a test controller with these endpoints:

### Upload File
```bash
POST /s3/upload
Content-Type: multipart/form-data
Body: file (binary)
```

### Download File
```bash
GET /s3/download/:key
```

### Delete File
```bash
DELETE /s3/:key
```

### List All Files
```bash
GET /s3/list
```

### Check File Exists
```bash
GET /s3/exists/:key
```

### Get File Metadata
```bash
GET /s3/metadata/:key
```

### Test Upload (Simple)
```bash
POST /s3/test
```

## Testing with cURL

### Upload a file:
```bash
curl -X POST http://localhost:3000/s3/upload \
  -F "file=@/path/to/file.pdf"
```

### Test simple upload:
```bash
curl -X POST http://localhost:3000/s3/test
```

### List files:
```bash
curl http://localhost:3000/s3/list
```

### Download file:
```bash
curl http://localhost:3000/s3/download/test/sample-123.txt -o downloaded.txt
```

## Testing with AWS CLI

### List files:
```bash
aws --endpoint-url=http://localhost:4566 s3 ls s3://document-storage
```

### Upload file:
```bash
aws --endpoint-url=http://localhost:4566 s3 cp file.txt s3://document-storage/
```

### Download file:
```bash
aws --endpoint-url=http://localhost:4566 s3 cp s3://document-storage/file.txt ./downloaded.txt
```

## File Organization Best Practices

Organize files by type:

```
document-storage/
├── invoices/
│   ├── 2026/
│   │   ├── 05/
│   │   │   ├── order-123.pdf
│   │   │   └── order-124.pdf
├── products/
│   ├── images/
│   │   ├── product-1.jpg
│   │   └── product-2.jpg
├── documents/
│   ├── terms.pdf
│   └── privacy.pdf
└── uploads/
    └── temp/
        └── user-upload-123.jpg
```

Example:
```typescript
const key = `invoices/${year}/${month}/${orderId}.pdf`;
```

## Error Handling

The service throws these exceptions:

- `NotFoundException` - File not found
- `InternalServerErrorException` - S3 operation failed

Example:
```typescript
try {
  const file = await this.s3Service.downloadFile('missing.pdf');
} catch (error) {
  if (error instanceof NotFoundException) {
    // Handle file not found
  } else {
    // Handle other errors
  }
}
```

## Production Deployment

### Using IAM Roles (Recommended)

For EC2/ECS/Lambda, use IAM roles instead of access keys:

1. Create IAM role with S3 permissions
2. Attach role to your EC2/ECS instance
3. Remove `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from .env
4. AWS SDK will automatically use the instance role

### Using Access Keys

1. Create IAM user with S3 permissions
2. Generate access keys
3. Store in environment variables (never commit to git)
4. Use AWS Secrets Manager or Parameter Store for production

### S3 Bucket Policy

Example bucket policy for production:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT-ID:role/your-app-role"
      },
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket/*",
        "arn:aws:s3:::your-bucket"
      ]
    }
  ]
}
```

## Troubleshooting

### Issue: "Connection refused to localhost:4566"
**Solution**: Floci container not running. Start it:
```bash
docker run -d --name floci-s3 -p 4566:4566 floci/floci
```

### Issue: "NoSuchBucket" error
**Solution**: Bucket not created. Create it:
```bash
aws --endpoint-url=http://localhost:4566 s3 mb s3://document-storage
```

### Issue: Files not appearing
**Solution**: Check `AWS_S3_FORCE_PATH_STYLE=true` is set in .env

### Issue: "Access Denied" in production
**Solution**: Check IAM permissions and bucket policy

## Performance Tips

1. **Use streams for large files** - Use `getFileStream()` instead of `downloadFile()`
2. **Use multipart upload** - Use `uploadLargeFile()` for files > 5MB
3. **Enable CloudFront** - Use CDN for frequently accessed files
4. **Set proper cache headers** - Add `CacheControl` metadata
5. **Use S3 Transfer Acceleration** - For global uploads

## Security Best Practices

1. **Never commit credentials** - Use environment variables
2. **Use IAM roles** - Avoid access keys when possible
3. **Enable bucket encryption** - Use SSE-S3 or SSE-KMS
4. **Enable versioning** - Protect against accidental deletion
5. **Use signed URLs** - For temporary public access
6. **Implement file validation** - Check file types and sizes
7. **Scan for malware** - Use AWS Macie or third-party tools

## Next Steps

1. ✅ Integrate with invoice generation
2. ✅ Add product image uploads
3. ✅ Implement document management
4. ✅ Add file upload validation
5. ✅ Implement signed URLs for private files
6. ✅ Add file compression before upload
7. ✅ Implement file versioning

---

**Module Version**: 1.0.0  
**Last Updated**: May 24, 2026  
**Maintainer**: Your Team
