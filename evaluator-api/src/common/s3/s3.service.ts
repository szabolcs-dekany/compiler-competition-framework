import {
  S3Client,
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

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('S3_ENDPOINT', {
      infer: true,
    }) as string;
    const endpointUrl = new URL(endpoint);

    this.bucket = this.configService.get<string>('S3_BUCKET', {
      infer: true,
    }) as string;

    this.client = new S3Client({
      endpoint,
      region: this.configService.get<string>('S3_REGION', { infer: true }),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY', {
          infer: true,
        }) as string,
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY', {
          infer: true,
        }) as string,
      },
      forcePathStyle:
        endpointUrl.hostname === 'localhost' ||
        endpointUrl.hostname === '127.0.0.1',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket '${this.bucket}' already exists`);
    } catch {
      this.logger.log(`Creating bucket '${this.bucket}'...`);
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`Bucket '${this.bucket}' created successfully`);
      } catch (error) {
        this.logger.error(`Failed to create bucket '${this.bucket}'`, error);
        throw new InternalServerErrorException(
          `Failed to initialize storage bucket: ${this.bucket}`,
        );
      }
    }
  }

  get clientInstance(): S3Client {
    return this.client;
  }

  get bucketName(): string {
    return this.bucket;
  }
}
