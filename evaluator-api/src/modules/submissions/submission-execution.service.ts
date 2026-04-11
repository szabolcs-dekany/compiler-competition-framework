import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SubmissionEventsService } from './submission-events.service';
import type {
  CompilationCompletionInput,
  CompilationCrashInput,
  UpdateCompilationStatusInput,
} from './submission-execution.types';

@Injectable()
export class SubmissionExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly submissionEventsService: SubmissionEventsService,
  ) {}

  async markCompilationStarted(submissionId: string): Promise<void> {
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'BUILDING',
        compileStatus: 'RUNNING',
        compileStartedAt: new Date(),
        compileCompletedAt: null,
        compileLogS3Key: null,
        compileError: null,
      },
    });

    await this.submissionEventsService.publishSubmissionEvent(
      submissionId,
      'status',
    );
  }

  async markCompilationCompleted(
    input: CompilationCompletionInput,
  ): Promise<void> {
    await this.prisma.submission.update({
      where: { id: input.submissionId },
      data: {
        status: input.hasSuccessfulCompilation ? 'READY' : 'FAILED',
        compileStatus: input.allFilesCompiled ? 'SUCCESS' : 'FAILED',
        compileLogS3Key: input.compileLogS3Key,
        compileCompletedAt: new Date(),
        compileError: input.allFilesCompiled
          ? null
          : 'One or more source files failed to compile',
      },
    });

    await this.submissionEventsService.publishSubmissionEvent(
      input.submissionId,
      'status',
    );
  }

  async markCompilationCrashed(input: CompilationCrashInput): Promise<void> {
    await this.prisma.submission.update({
      where: { id: input.submissionId },
      data: {
        status: 'FAILED',
        compileStatus: 'FAILED',
        compileLogS3Key: input.compileLogS3Key,
        compileCompletedAt: new Date(),
        compileError: input.errorMessage,
      },
    });

    await this.submissionEventsService.publishSubmissionEvent(
      input.submissionId,
      'complete',
    );
  }

  async updateCompilationStatus(
    compilationId: string,
    status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED',
    opts?: UpdateCompilationStatusInput,
  ): Promise<void> {
    const updateData: {
      status: typeof status;
      startedAt?: Date;
      completedAt?: Date | null;
      s3Key?: string;
      errorMessage?: string | null;
    } = { status };

    if (status === 'IN_PROGRESS') {
      updateData.startedAt = new Date();
      updateData.completedAt = null;
      updateData.errorMessage = null;
    }

    if (status === 'SUCCESS' || status === 'FAILED') {
      updateData.completedAt = new Date();
    }

    if (opts?.s3Key) {
      updateData.s3Key = opts.s3Key;
    }

    if (opts && 'errorMessage' in opts) {
      updateData.errorMessage = opts.errorMessage ?? null;
    }

    await this.prisma.compilation.update({
      where: { id: compilationId },
      data: updateData,
    });

    await this.submissionEventsService.publishCompilationStatus(compilationId);
  }
}
