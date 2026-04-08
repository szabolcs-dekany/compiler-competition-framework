import { ApiProperty } from '@nestjs/swagger';

export class SourceFileEntity {
  @ApiProperty({ description: 'Source file ID' })
  id: string;

  @ApiProperty({ description: 'Team ID' })
  teamId: string;

  @ApiProperty({ description: 'Test case ID' })
  testCaseId: string;

  @ApiProperty({ description: 'Original file name' })
  originalName: string;

  @ApiProperty({ description: 'File extension' })
  extension: string;

  @ApiProperty({ description: 'File size in bytes' })
  size: number;

  @ApiProperty({ description: 'SHA-256 checksum' })
  checksum: string;

  @ApiProperty({ description: 'Version number' })
  version: number;

  @ApiProperty({ description: 'Upload timestamp' })
  uploadedAt: string;

  @ApiProperty({
    description: 'Compiled binary S3 key',
    required: false,
    nullable: true,
  })
  compiledS3Key?: string;

  @ApiProperty({
    description: 'Compilation timestamp',
    required: false,
    nullable: true,
  })
  compiledAt?: string;

  @ApiProperty({
    description: 'Submission version that compiled this file',
    required: false,
    nullable: true,
  })
  compiledSubmissionVersion?: number;
}
