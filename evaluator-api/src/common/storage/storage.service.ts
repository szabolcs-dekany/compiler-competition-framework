import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageConfig } from './storage.config';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly config: StorageConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<StorageConfig>('storage')!;

    const endpoint = new URL(this.config.endpoint);
    this.client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
      forcePathStyle:
        endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.bucket }),
      );
      this.logger.log(`Bucket '${this.config.bucket}' already exists`);
    } catch {
      this.logger.log(`Creating bucket '${this.config.bucket}'...`);
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.config.bucket }),
        );
        this.logger.log(`Bucket '${this.config.bucket}' created successfully`);
      } catch (error) {
        this.logger.error(
          `Failed to create bucket '${this.config.bucket}'`,
          error,
        );
        throw new InternalServerErrorException(
          `Failed to initialize storage bucket: ${this.config.bucket}`,
        );
      }
    }
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType || 'application/octet-stream',
        }),
      );
      this.logger.debug(`Uploaded file to '${key}'`);
    } catch (error) {
      this.logger.error(`Failed to upload file '${key}'`, error);
      throw new InternalServerErrorException(`Failed to upload file: ${key}`);
    }
  }

  async getFile(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );

      const body = response.Body;
      if (!body) {
        throw new Error('Empty response body');
      }

      const chunks: Uint8Array[] = [];
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(`Failed to get file '${key}'`, error);
      throw new InternalServerErrorException(`Failed to retrieve file: ${key}`);
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );
      this.logger.debug(`Deleted file '${key}'`);
    } catch (error) {
      this.logger.error(`Failed to delete file '${key}'`, error);
      throw new InternalServerErrorException(`Failed to delete file: ${key}`);
    }
  }
}
