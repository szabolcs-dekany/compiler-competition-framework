import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import bull from 'bull';
import * as path from 'path';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TestCaseLoaderService } from '../../../common/test-case-loader/test-case-loader.service';
import { EvaluateJobData } from '../dto/jobs.dto';
import { RetryableJobError } from '../errors/retryable-job.error';
import { EvaluateAttemptService } from '../services/evaluate/evaluate-attempt.service';
import { EvaluateWorkspaceService } from '../services/evaluate/evaluate-workspace.service';
import { TestRunExecutionService } from '../services/test-run-execution.service';
import type {
  CompilationSnapshot,
  EvaluationContext,
} from '../types/evaluate-queue-consumer.types';

const DEFAULT_EVALUATE_QUEUE_CONCURRENCY = 4;

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

const EVALUATE_QUEUE_CONCURRENCY = readPositiveIntEnv(
  'EVALUATE_QUEUE_CONCURRENCY',
  DEFAULT_EVALUATE_QUEUE_CONCURRENCY,
);

@Processor('evaluate')
export class EvaluateQueueConsumerService {
  private readonly logger = new Logger(EvaluateQueueConsumerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly testRunExecutionService: TestRunExecutionService,
    private readonly testCaseLoader: TestCaseLoaderService,
    private readonly workspaceService: EvaluateWorkspaceService,
    private readonly attemptService: EvaluateAttemptService,
  ) {}

  @Process({ concurrency: EVALUATE_QUEUE_CONCURRENCY })
  async processEvaluateJob(job: bull.Job<EvaluateJobData>): Promise<void> {
    const context = this.createContext(job);
    const attemptNumber = job.attemptsMade + 1;
    const totalAttempts = job.opts.attempts ?? 1;
    let rethrowError: Error | null = null;

    this.logger.log(
      `Evaluate queue job ${job.id} attempt ${attemptNumber}/${totalAttempts} for submission ${context.submissionId} and compilation ${context.compilationId}`,
    );

    try {
      const compilation = await this.loadCompilationSnapshot(
        context.compilationId,
      );
      const testCase = this.testCaseLoader.get(compilation.testCaseId);

      if (!testCase) {
        throw new NotFoundException(
          `Test case with id ${compilation.testCaseId} not found`,
        );
      }

      if (compilation.status !== 'SUCCESS' || !compilation.compiledS3Key) {
        await this.testRunExecutionService.recordCompilationFailureResult({
          submissionId: compilation.submissionId,
          compilationId: compilation.id,
          testCaseId: compilation.testCaseId,
          compileTimeMs: this.getCompileTimeMs(compilation),
          errorMessage:
            compilation.errorMessage ??
            `Compilation failed for ${compilation.testCaseId}`,
        });
        await this.testRunExecutionService.finalizeSubmissionIfComplete(
          compilation.submissionId,
        );
        return;
      }

      await this.testRunExecutionService.markSubmissionEvaluating(
        compilation.submissionId,
      );

      const testRun =
        await this.testRunExecutionService.ensureEvaluationTestRun({
          submissionId: compilation.submissionId,
          compilationId: compilation.id,
          testCaseId: compilation.testCaseId,
          compileTimeMs: this.getCompileTimeMs(compilation),
        });
      await this.testRunExecutionService.updateTestRun(testRun.id, {
        status: 'RUNNING',
        errorMessage: null,
        completedAt: null,
      });

      const attempts = await this.attemptService.ensureAttempts(
        testRun.id,
        testCase,
      );
      this.logger.debug(
        `Evaluate queue job ${job.id} prepared ${attempts.length} attempt(s) for testRun ${testRun.id}`,
      );

      this.logger.debug(
        `Evaluate queue job ${job.id} preparing workspace for compilation ${context.compilationId}`,
      );
      const binaryName = await this.workspaceService.prepare(
        context,
        compilation,
      );
      this.logger.debug(
        `Evaluate queue job ${job.id} prepared workspace for compilation ${context.compilationId} with binary ${binaryName}`,
      );

      for (const attempt of attempts) {
        await this.attemptService.runAttempt(
          context,
          compilation,
          testRun.id,
          testCase,
          binaryName,
          attempt,
        );
      }

      this.logger.debug(
        `Evaluate queue job ${job.id} summarizing results for testRun ${testRun.id}`,
      );
      const summary = await this.attemptService.summarizeResults(
        testCase,
        testRun.id,
      );

      this.logger.debug(
        `Evaluate queue job ${job.id} persisting summary for testRun ${testRun.id}`,
      );
      await this.testRunExecutionService.updateTestRun(testRun.id, {
        status: summary.status,
        runSuccess: summary.runSuccess,
        runTimeMs: summary.runTimeMs,
        actualStdout: summary.actualStdout,
        actualStderr: summary.actualStderr,
        expectedStdout: summary.expectedStdout,
        expectedExitCode: summary.expectedExitCode,
        actualExitCode: summary.actualExitCode,
        pointsEarned: summary.pointsEarned,
        bonusEarned: summary.bonusEarned,
        errorMessage: summary.errorMessage,
        completedAt: new Date(),
      });

      this.logger.debug(
        `Evaluate queue job ${job.id} finalizing submission ${compilation.submissionId}`,
      );
      await this.testRunExecutionService.finalizeSubmissionIfComplete(
        compilation.submissionId,
      );
      this.logger.debug(
        `Evaluate queue job ${job.id} completed for compilation ${context.compilationId}`,
      );
    } catch (error) {
      if (error instanceof RetryableJobError) {
        rethrowError = error;
        this.logger.warn(
          `Evaluate queue job ${job.id} attempt ${attemptNumber}/${totalAttempts} hit retryable failure for compilation ${context.compilationId}: ${error.message}`,
        );
      } else {
        try {
          await this.handleEvaluationFailure(context, error);
        } catch (handleError) {
          rethrowError = ensureError(
            handleError,
            `Failed to persist evaluation failure for compilation ${context.compilationId}`,
          );
          this.logger.error(
            `Failed to persist evaluation failure for compilation ${context.compilationId}: ${rethrowError.message}`,
          );
        }
      }
    } finally {
      try {
        await this.workspaceService.cleanup(context);
      } catch (error) {
        this.logger.error(
          `Failed to clean evaluate workspace for compilation ${context.compilationId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    if (rethrowError) {
      throw rethrowError;
    }
  }

  private createContext(job: bull.Job<EvaluateJobData>): EvaluationContext {
    return {
      submissionId: job.data.submissionId,
      compilationId: job.data.compilationId,
      tempDir: path.join(process.cwd(), 'tmp', `evaluate-${job.id}`),
      scratchRootDir: path.join(
        process.cwd(),
        'tmp',
        `evaluate-${job.id}-scratch`,
      ),
    };
  }

  private async loadCompilationSnapshot(
    compilationId: string,
  ): Promise<CompilationSnapshot> {
    const compilation = await this.prisma.compilation.findUnique({
      where: { id: compilationId },
      include: {
        submission: true,
        sourceFileVersion: {
          include: {
            sourceFile: true,
          },
        },
      },
    });

    if (!compilation) {
      throw new NotFoundException(
        `Compilation with id ${compilationId} not found`,
      );
    }

    if (compilation.status === 'SUCCESS' && !compilation.s3Key) {
      throw new ConflictException(
        `No compiled binary available for compilation ${compilationId}`,
      );
    }

    if (
      compilation.status === 'SUCCESS' &&
      !compilation.submission.dockerImageName
    ) {
      throw new ConflictException(
        `No Docker image snapshot available for submission ${compilation.submissionId}`,
      );
    }

    return {
      id: compilation.id,
      submissionId: compilation.submissionId,
      testCaseId: compilation.sourceFileVersion.sourceFile.testCaseId,
      status: compilation.status,
      compiledS3Key: compilation.s3Key,
      errorMessage: compilation.errorMessage,
      startedAt: compilation.startedAt,
      completedAt: compilation.completedAt,
      submission: {
        id: compilation.submission.id,
        teamId: compilation.submission.teamId,
        dockerImageName: compilation.submission.dockerImageName,
      },
    };
  }

  private async handleEvaluationFailure(
    context: EvaluationContext,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown evaluation error';

    this.logger.error(
      `Evaluation failed for compilation ${context.compilationId}: ${errorMessage}`,
    );

    const compilation = await this.prisma.compilation.findUnique({
      where: { id: context.compilationId },
      include: {
        sourceFileVersion: {
          include: {
            sourceFile: true,
          },
        },
      },
    });

    if (compilation) {
      await this.testRunExecutionService.recordEvaluationFailure({
        submissionId: context.submissionId,
        compilationId: context.compilationId,
        testCaseId: compilation.sourceFileVersion.sourceFile.testCaseId,
        errorMessage,
      });
    }

    await this.testRunExecutionService.finalizeSubmissionIfComplete(
      context.submissionId,
    );
  }

  private getCompileTimeMs(compilation: CompilationSnapshot): number | null {
    if (!compilation.startedAt || !compilation.completedAt) {
      return null;
    }

    return Math.max(
      0,
      compilation.completedAt.getTime() - compilation.startedAt.getTime(),
    );
  }
}
