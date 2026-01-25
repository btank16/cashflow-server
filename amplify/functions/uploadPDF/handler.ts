import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Schema } from '../../data/resource';

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;
const URL_EXPIRY_SECONDS = 3600; // 1 hour

export const handler: Schema['uploadPDF']['functionHandler'] = async (event) => {
  try {
    const { base64Data, filename, userId } = event.arguments;

    if (!base64Data || !filename) {
      return {
        success: false,
        error: 'Missing required fields',
      };
    }

    const key = `pdfs/${userId || 'anonymous'}/${Date.now()}_${filename}`;
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
    }));

    // Generate presigned URL for download
    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
      { expiresIn: URL_EXPIRY_SECONDS }
    );

    return {
      success: true,
      url,
      expiresIn: URL_EXPIRY_SECONDS,
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: 'Upload failed',
    };
  }
};
