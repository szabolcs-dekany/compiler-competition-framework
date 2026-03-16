import { ApiProperty } from '@nestjs/swagger';

export class DockerfileEntity {
  @ApiProperty({ description: 'Dockerfile ID' })
  id: string;

  @ApiProperty({ description: 'Team ID' })
  teamId: string;

  @ApiProperty({ description: 'Original file name' })
  originalName: string;

  @ApiProperty({ description: 'File size in bytes' })
  size: number;

  @ApiProperty({ description: 'SHA-256 checksum' })
  checksum: string;

  @ApiProperty({ description: 'Version number' })
  version: number;

  @ApiProperty({ description: 'Upload timestamp' })
  uploadedAt: string;
}
