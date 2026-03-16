import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ description: 'Upload timestamp' })
  uploadedAt: string;
}
