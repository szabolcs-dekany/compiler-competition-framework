import { ApiProperty } from '@nestjs/swagger';
import { SubmissionStatus } from '@prisma/client';

export class Submission {
  @ApiProperty({ example: 'clx123abc' })
  id: string;

  @ApiProperty({ example: 'clx456def' })
  teamId: string;

  @ApiProperty({ example: 'Compiler Crusaders' })
  teamName: string;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({
    example: '/artifacts/compilers/team1/v1.tar.gz',
    nullable: true,
  })
  compilerPath: string | null;

  @ApiProperty({ enum: SubmissionStatus, example: SubmissionStatus.PENDING })
  status: SubmissionStatus;

  @ApiProperty({ example: '2025-01-15T10:30:00Z' })
  submittedAt: Date;

  @ApiProperty({ example: 0 })
  totalScore: number;
}
