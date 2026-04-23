import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Readable } from 'stream';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly s3Service: S3Service) {
    this.client = this.s3Service.clientInstance;
    this.bucket = this.s3Service.bucketName;
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
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
          Bucket: this.bucket,
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

  async getFileStream(key: string): Promise<Readable> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      const body = response.Body;
      if (!body) {
        throw new Error('Empty response body');
      }

      return body instanceof Readable
        ? body
        : Readable.from(body as AsyncIterable<Uint8Array>);
    } catch (error) {
      this.logger.error(`Failed to get file stream '${key}'`, error);
      throw new InternalServerErrorException(`Failed to retrieve file: ${key}`);
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
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
