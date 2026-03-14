import { registerAs } from '@nestjs/config';

export interface StorageConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

export const storageConfig = registerAs(
  'storage',
  (): StorageConfig => ({
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
    bucket: process.env.S3_BUCKET || 'evaluator-artifacts',
    region: process.env.S3_REGION || 'us-east-1',
  }),
);
