import { ApiProperty } from '@nestjs/swagger';
import type { BuildStatus } from '@evaluator/shared';

export class DockerfileVersionEntity {
  @ApiProperty({ description: 'Version ID' })
  id: string;

  @ApiProperty({ description: 'Dockerfile ID' })
  dockerfileId: string;

  @ApiProperty({ description: 'Version number' })
  version: number;

  @ApiProperty({ description: 'File size in bytes' })
  size: number;

  @ApiProperty({ description: 'SHA-256 checksum' })
  checksum: string;

  @ApiProperty({
    description: 'Built image name for this Dockerfile version',
    nullable: true,
  })
  imageName?: string | null;

  @ApiProperty({ description: 'Upload timestamp' })
  uploadedAt: string;

  @ApiProperty({
    description: 'Build status',
    enum: ['PENDING', 'BUILDING', 'SUCCESS', 'FAILED'],
  })
  buildStatus: BuildStatus;

  @ApiProperty({
    description: 'S3 key for build logs',
    nullable: true,
  })
  buildLogS3Key?: string | null;

  @ApiProperty({
    description: 'Build start timestamp',
    nullable: true,
  })
  buildStartedAt?: string | null;

  @ApiProperty({
    description: 'Build completion timestamp',
    nullable: true,
  })
  buildCompletedAt?: string | null;

  @ApiProperty({
    description: 'Build error message',
    nullable: true,
  })
  buildError?: string | null;
}
