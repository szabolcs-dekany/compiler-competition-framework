import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import bull from 'bull';
import * as path from 'path';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisLogService } from '../../../common/redis/redis-log.service';
import { CompileJobData } from '../dto/jobs.dto';
import { EvaluateQueueService } from '../../queue/evaluate-queue.service';
import { SubmissionExecutionService } from '../../submissions/submission-execution.service';
import { CompileTeamLockService } from '../services/compile/compile-team-lock.service';
import { CompileWorkspaceService } from '../services/compile/compile-workspace.service';
import { CompileExecutionService } from '../services/compile/compile-execution.service';
import { RetryableJobError } from '../errors/retryable-job.error';
import type {
  CompilationContext,
  CompletedCompilation,
  SubmissionSnapshot,
  TeamLock,
  TeamLockHeartbeat,
} from '../types/compile-queue-consumer.types';

const DEFAULT_COMPILE_QUEUE_CONCURRENCY = 4;

function readPositiveIntEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ensureError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage);
}

const COMPILE_QUEUE_CONCURRENCY = readPositiveIntEnv(
  'COMPILE_QUEUE_CONCURRENCY',
  DEFAULT_COMPILE_QUEUE_CONCURRENCY,
);

@Processor('compile')
export class CompileQueueConsumerService {
  private readonly logger = new Logger(CompileQueueConsumerService.name);

  constructor(
    private readonly submissionExecutionService: SubmissionExecutionService,
    private readonly evaluateQueueService: EvaluateQueueService,
    private readonly prisma: PrismaService,
    private readonly redisLogService: RedisLogService,
    private readonly teamLockService: CompileTeamLockService,
    private readonly workspaceService: CompileWorkspaceService,
    private readonly executionService: CompileExecutionService,
  ) {}

  @Process({ concurrency: COMPILE_QUEUE_CONCURRENCY })
  async processCompileJob(compileJob: bull.Job<CompileJobData>): Promise<void> {
    const context = this.createCompilationContext(compileJob);
    const attemptNumber = compileJob.attemptsMade + 1;
    const totalAttempts = compileJob.opts.attempts ?? 1;
    let lock: TeamLock | null = null;
    let heartbeat: TeamLockHeartbeat | null = null;
    let rethrowError: Error | null = null;

    this.logger.log(
      `Compile queue job ${compileJob.id} attempt ${attemptNumber}/${totalAttempts} for submission ${context.submissionId}`,
    );

    this.logger.debug(
      `Compile queue job received: ${compileJob.id} for submission ${context.submissionId}`,
    );

    try {
      const acquiredLock = await this.teamLockService.acquire(context);
      lock = acquiredLock.lock;
      heartbeat = acquiredLock.heartbeat;

      heartbeat.throwIfLockLost();
      const submission = await this.loadSubmissionSnapshot(
        context.submissionId,
      );
      this.validateSubmissionSnapshot(submission);

      await this.initializeJobState(context.submissionId);
      await this.workspaceService.prepare(context, submission);
      heartbeat.throwIfLockLost();

      const completedCompilations = await this.executionService.compileAll(
        context,
        submission,
      );
      heartbeat.throwIfLockLost();

      await this.persistCompilationResults(
        context,
        submission,
        completedCompilations,
      );
    } catch (error) {
      if (error instanceof RetryableJobError) {
        rethrowError = error;
        this.logger.warn(
          `Compile queue job ${compileJob.id} attempt ${attemptNumber}/${totalAttempts} hit retryable failure for submission ${context.submissionId}: ${error.message}`,
        );
      } else {
        try {
          await this.handleCompilationFailure(context, error);
        } catch (handleError) {
          rethrowError = ensureError(
            handleError,
            `Failed to persist compilation failure for submission ${context.submissionId}`,
          );
          this.logCleanupFailure(
            `Failed to persist compilation failure for submission ${context.submissionId}`,
            rethrowError,
          );
        }
      }
    } finally {
      try {
        heartbeat?.stop();
      } catch (error) {
        this.logCleanupFailure(
          `Failed to stop compile heartbeat for submission ${context.submissionId}`,
          error,
        );
      }

      try {
        if (lock) {
          await this.teamLockService.release(context, lock);
        }
      } catch (error) {
        this.logCleanupFailure(
          `Failed to release compile lock for submission ${context.submissionId}`,
          error,
        );
      }

      try {
        await this.workspaceService.cleanup(context);
      } catch (error) {
        this.logCleanupFailure(
          `Failed to clean compile workspace for submission ${context.submissionId}`,
          error,
        );
      }
    }

    if (rethrowError) {
      throw rethrowError;
    }
  }

  private createCompilationContext(
    compileJob: bull.Job<CompileJobData>,
  ): CompilationContext {
    const { submissionId, teamId, version } = compileJob.data;
    const tempDir = path.join(process.cwd(), 'tmp', String(compileJob.id));
    const scratchDir = path.join(tempDir, '.scratch');

    return {
      submissionId,
      teamId,
      version,
      jobId: String(compileJob.id),
      tempDir,
      scratchDir,
    };
  }

  private async loadSubmissionSnapshot(
    submissionId: string,
  ): Promise<SubmissionSnapshot> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        compilations: {
          include: {
            sourceFileVersion: {
              include: {
                sourceFile: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException(
        `Submission with id ${submissionId} not found`,
      );
    }

    return {
      id: submission.id,
      teamId: submission.teamId,
      version: submission.version,
      originalName: submission.originalName,
      compilerPath: submission.compilerPath,
      dockerImageName: submission.dockerImageName,
      compilations: submission.compilations
        .map((compilation) => ({
          id: compilation.id,
          testCaseId: compilation.sourceFileVersion.sourceFile.testCaseId,
          originalName: compilation.sourceFileVersion.originalName,
          workspaceName: `${compilation.sourceFileVersion.sourceFile.testCaseId}${path.extname(compilation.sourceFileVersion.originalName)}`,
          s3Key: compilation.sourceFileVersion.s3Key,
        }))
        .sort((left, right) => left.testCaseId.localeCompare(right.testCaseId)),
    };
  }

  private validateSubmissionSnapshot(submission: SubmissionSnapshot): void {
    if (!submission.compilerPath) {
      throw new BadRequestException(
        `No compiler path available for submission ${submission.id}`,
      );
    }

    if (!submission.dockerImageName) {
      throw new BadRequestException(
        `No Docker image snapshot available for submission ${submission.id}`,
      );
    }

    if (submission.compilations.length === 0) {
      throw new BadRequestException(
        `No source file snapshots available for submission ${submission.id}`,
      );
    }
  }

  private async initializeJobState(submissionId: string): Promise<void> {
    await this.submissionExecutionService.markCompilationStarted(submissionId);
  }

  private async persistCompilationResults(
    context: CompilationContext,
    submission: SubmissionSnapshot,
    completedCompilations: CompletedCompilation[],
  ): Promise<void> {
    const successfulCompilationCount = completedCompilations.filter(
      (compilation) => compilation.succeeded,
    ).length;
    const allFilesCompiled =
      successfulCompilationCount === submission.compilations.length;
    const logS3Key = await this.executionService.uploadLogs(context);
    const hasSuccessfulCompilation = successfulCompilationCount > 0;

    await this.submissionExecutionService.markCompilationCompleted({
      submissionId: context.submissionId,
      hasSuccessfulCompilation,
      allFilesCompiled,
      compileLogS3Key: logS3Key,
    });

    for (const completedCompilation of completedCompilations) {
      await this.evaluateQueueService.dispatchEvaluateJob({
        submissionId: context.submissionId,
        compilationId: completedCompilation.compilationId,
      });
    }
  }

  private async handleCompilationFailure(
    context: CompilationContext,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    await this.redisLogService.appendLog(
      context.submissionId,
      `ERROR: ${errorMessage}`,
    );

    try {
      const logS3Key = await this.executionService.uploadLogs(context);
      await this.submissionExecutionService.markCompilationCrashed({
        submissionId: context.submissionId,
        errorMessage,
        compileLogS3Key: logS3Key,
      });
    } catch (uploadError) {
      this.logger.error(
        `Failed to upload error logs: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`,
      );
      await this.submissionExecutionService.markCompilationCrashed({
        submissionId: context.submissionId,
        errorMessage,
      });
    }
  }

  private logCleanupFailure(message: string, error: unknown): void {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`${message}: ${errorMessage}`);
  }
}
