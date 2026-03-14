import { ApiProperty } from '@nestjs/swagger';

export class SourceFileVersionEntity {
  @ApiProperty({ description: 'Version ID' })
  id: string;

  @ApiProperty({ description: 'Source file ID' })
  sourceFileId: string;

  @ApiProperty({ description: 'Version number' })
  version: number;

  @ApiProperty({ description: 'File size in bytes' })
  size: number;

  @ApiProperty({ description: 'SHA-256 checksum' })
  checksum: string;

  @ApiProperty({ description: 'Upload timestamp' })
  uploadedAt: string;
}
