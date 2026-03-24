import { ApiProperty } from '@nestjs/swagger';
import { SubmissionStatus, CompileStatus } from '@prisma/client';

export class Submission {
  @ApiProperty({ example: 'clx123abc' })
  id: string;

  @ApiProperty({ example: 'clx456def' })
  teamId: string;

  @ApiProperty({ example: 'Compiler Crusaders' })
  teamName: string;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: 'my-compiler.zip' })
  originalName: string;

  @ApiProperty({ example: '.zip' })
  extension: string;

  @ApiProperty({
    example: 'compilers/clx456def/clx123abc.zip',
    nullable: true,
  })
  compilerPath: string | null;

  @ApiProperty({ enum: SubmissionStatus, example: SubmissionStatus.PENDING })
  status: SubmissionStatus;

  @ApiProperty({ example: '2025-01-15T10:30:00Z' })
  submittedAt: Date;

  @ApiProperty({ example: 0 })
  totalScore: number;

  @ApiProperty({ enum: CompileStatus, example: CompileStatus.PENDING })
  compileStatus: CompileStatus;

  @ApiProperty({ example: 'compiles/clx456def/v1/compile.log', nullable: true })
  compileLogS3Key: string | null;

  @ApiProperty({ example: '2025-01-15T10:35:00Z', nullable: true })
  compileStartedAt: Date | null;

  @ApiProperty({ example: '2025-01-15T10:36:00Z', nullable: true })
  compileCompletedAt: Date | null;

  @ApiProperty({ example: 'Compilation failed', nullable: true })
  compileError: string | null;
}
