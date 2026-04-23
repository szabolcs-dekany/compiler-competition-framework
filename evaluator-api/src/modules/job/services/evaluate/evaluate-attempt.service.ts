import { Injectable, Logger } from '@nestjs/common';
import { mkdir, rm } from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { TestCaseExecutionService } from '../../../../common/test-case-execution/test-case-execution.service';
import type {
  GeneratedAttempt,
  TestRunSummary,
} from '../../../../common/test-case-execution/test-case-execution.types';
import type { TestCase } from '../../../../common/test-case-loader/test-case-loader.types';
import { DockerService } from '../../../docker/docker.service';
import type { RunContainerResult } from '../../../docker/docker.types';
import { RetryableJobError } from '../../errors/retryable-job.error';
import type {
  CompilationSnapshot,
  EvaluationContext,
} from '../../types/evaluate-queue-consumer.types';

const DEFAULT_EVALUATE_ATTEMPT_PERSIST_TIMEOUT_MS = 10_000;

function readPositiveIntEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const EVALUATE_ATTEMPT_PERSIST_TIMEOUT_MS = readPositiveIntEnv(
  'EVALUATE_ATTEMPT_PERSIST_TIMEOUT_MS',
  DEFAULT_EVALUATE_ATTEMPT_PERSIST_TIMEOUT_MS,
);

interface SuccessfulAttemptExecution {
  succeeded: true;
  dockerResult: RunContainerResult;
  runTimeMs: number;
  passed: boolean;
}

interface FailedAttemptExecution {
  succeeded: false;
  errorMessage: string;
  runTimeMs: number;
}

type AttemptExecutionResult =
  | SuccessfulAttemptExecution
  | FailedAttemptExecution;

@Injectable()
export class EvaluateAttemptService {
  private readonly logger = new Logger(EvaluateAttemptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dockerService: DockerService,
    private readonly testCaseExecutionService: TestCaseExecutionService,
  ) {}

  async ensureAttempts(
    testRunId: string,
    testCase: TestCase,
  ): Promise<GeneratedAttempt[]> {
    const existingAttempts = await this.prisma.testRunAttempt.findMany({
      where: { testRunId },
      orderBy: { attemptIndex: 'asc' },
    });

    if (existingAttempts.length > 0) {
      return existingAttempts.map((attempt) => ({
        attemptIndex: attempt.attemptIndex,
        seed: attempt.seed,
        generatedInputs:
          typeof attempt.generatedInputs === 'object' &&
          attempt.generatedInputs !== null
            ? (attempt.generatedInputs as Record<string, number | string>)
            : {},
        stdin: attempt.stdin,
        validationMode: attempt.validationMode,
        expectedStdout: attempt.expectedStdout,
        expectedExitCode: attempt.expectedExitCode,
      }));
    }

    const attempts = this.testCaseExecutionService.generateAttempts(testCase);

    await this.prisma.testRunAttempt.createMany({
      data: attempts.map((attempt) => ({
        testRunId,
        attemptIndex: attempt.attemptIndex,
        seed: attempt.seed,
        generatedInputs: attempt.generatedInputs,
        stdin: attempt.stdin,
        validationMode: attempt.validationMode,
        expectedStdout: attempt.expectedStdout,
        expectedExitCode: attempt.expectedExitCode,
      })),
    });

    return attempts;
  }

  async runAttempt(
    context: EvaluationContext,
    compilation: CompilationSnapshot,
    testRunId: string,
    testCase: TestCase,
    binaryName: string,
    attempt: GeneratedAttempt,
  ): Promise<void> {
    const attemptScratchDir = path.join(
      context.scratchRootDir,
      `attempt-${attempt.attemptIndex}`,
    );
    const attemptLabel = `submission ${context.submissionId}, compilation ${context.compilationId}, testRun ${testRunId}, attempt ${attempt.attemptIndex}`;
    let executionResult: AttemptExecutionResult | null = null;

    try {
      executionResult = await this.executeAttempt(
        context,
        compilation,
        testCase,
        binaryName,
        attempt,
        attemptScratchDir,
        attemptLabel,
      );
    } finally {
      try {
        await rm(attemptScratchDir, { recursive: true, force: true });
      } catch (error) {
        this.logger.error(
          `Failed to clean attempt scratch directory for ${attemptLabel}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    if (!executionResult) {
      throw new RetryableJobError(
        `Attempt execution did not complete for ${attemptLabel}`,
      );
    }

    if (executionResult.succeeded) {
      await this.persistSuccessfulAttempt(
        testRunId,
        testCase,
        attempt,
        executionResult,
        attemptLabel,
      );
      return;
    }

    await this.persistFailedAttempt(
      testRunId,
      attempt,
      executionResult,
      attemptLabel,
    );
  }

  async summarizeResults(
    testCase: TestCase,
    testRunId: string,
  ): Promise<TestRunSummary> {
    const completedAttempts = await this.prisma.testRunAttempt.findMany({
      where: { testRunId },
      orderBy: { attemptIndex: 'asc' },
    });

    return this.testCaseExecutionService.summarizeResults(
      testCase,
      completedAttempts.map((attempt) => ({
        validationMode: attempt.validationMode,
        expectedStdout: attempt.expectedStdout,
        expectedExitCode: attempt.expectedExitCode,
        actualStdout: attempt.actualStdout,
        actualStderr: attempt.actualStderr,
        actualExitCode: attempt.actualExitCode,
        runTimeMs: attempt.runTimeMs,
        passed: attempt.passed,
        errorMessage: attempt.errorMessage,
      })),
    );
  }

  private async executeAttempt(
    context: EvaluationContext,
    compilation: CompilationSnapshot,
    testCase: TestCase,
    binaryName: string,
    attempt: GeneratedAttempt,
    attemptScratchDir: string,
    attemptLabel: string,
  ): Promise<AttemptExecutionResult> {
    const startTime = Date.now();

    try {
      await Promise.all([
        mkdir(attemptScratchDir, { recursive: true }),
        mkdir(path.join(attemptScratchDir, '.home'), { recursive: true }),
        mkdir(path.join(attemptScratchDir, '.tmp'), { recursive: true }),
      ]);

      const rawArgs = testCase.args as string[] | string;
      const explicitArgs = Array.isArray(rawArgs)
        ? rawArgs
        : rawArgs.split(' ').filter(Boolean);
      const testArgs =
        explicitArgs.length > 0
          ? explicitArgs
          : (attempt.stdin?.split(' ').filter(Boolean) ?? []);

      this.logger.debug(
        `Running evaluate attempt for ${attemptLabel} with args: ${testArgs.join(' ')}`,
      );

      const dockerResult = await this.dockerService.runContainer({
        imageName: compilation.submission.dockerImageName as string,
        command: [`./${binaryName}`, ...testArgs],
        mountPath: context.tempDir,
        containerPath: '/workspace',
        scratchHostPath: attemptScratchDir,
        scratchContainerPath: '/scratch',
        env: [
          'HOME=/scratch/.home',
          'TMPDIR=/scratch/.tmp',
          'TMP=/scratch/.tmp',
          'TEMP=/scratch/.tmp',
        ],
        stdin: attempt.stdin,
        timeoutMs: testCase.timeout_ms,
        memoryMb: testCase.max_memory_mb,
        tmpfsSizeMb: testCase.max_memory_mb,
        readOnlyMount: true,
      });

      this.logger.debug(
        `Container execution finished for ${attemptLabel} with exit code ${dockerResult.exitCode}`,
      );

      const runTimeMs = Date.now() - startTime;
      const passed = this.testCaseExecutionService.validateAttempt(
        testCase,
        attempt,
        dockerResult.stdout,
        dockerResult.exitCode,
      );

      return {
        succeeded: true,
        dockerResult,
        runTimeMs,
        passed,
      };
    } catch (error) {
      if (error instanceof RetryableJobError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown evaluation error';

      this.logger.error(
        `Evaluate attempt execution failed for ${attemptLabel}: ${errorMessage}`,
      );

      return {
        succeeded: false,
        errorMessage,
        runTimeMs: Date.now() - startTime,
      };
    }
  }

  private async persistSuccessfulAttempt(
    testRunId: string,
    testCase: TestCase,
    attempt: GeneratedAttempt,
    executionResult: SuccessfulAttemptExecution,
    attemptLabel: string,
  ): Promise<void> {
    this.logger.debug(`Persisting evaluate attempt result for ${attemptLabel}`);

    await this.withRetryableTimeout(
      this.prisma.testRunAttempt.update({
        where: {
          testRunId_attemptIndex: {
            testRunId,
            attemptIndex: attempt.attemptIndex,
          },
        },
        data: {
          actualStdout: executionResult.dockerResult.stdout,
          actualStderr: executionResult.dockerResult.stderr,
          actualExitCode: executionResult.dockerResult.exitCode,
          runTimeMs: executionResult.runTimeMs,
          passed: executionResult.passed,
          errorMessage: executionResult.passed
            ? null
            : executionResult.dockerResult.exitCode === -1
              ? `Execution timed out after ${testCase.timeout_ms}ms`
              : 'Output mismatch',
          completedAt: new Date(),
        },
      }),
      EVALUATE_ATTEMPT_PERSIST_TIMEOUT_MS,
      `Timed out while persisting attempt result for ${attemptLabel}`,
    );

    this.logger.debug(`Persisted evaluate attempt result for ${attemptLabel}`);
  }

  private async persistFailedAttempt(
    testRunId: string,
    attempt: GeneratedAttempt,
    executionResult: FailedAttemptExecution,
    attemptLabel: string,
  ): Promise<void> {
    this.logger.debug(
      `Persisting failed evaluate attempt result for ${attemptLabel}`,
    );

    await this.withRetryableTimeout(
      this.prisma.testRunAttempt.update({
        where: {
          testRunId_attemptIndex: {
            testRunId,
            attemptIndex: attempt.attemptIndex,
          },
        },
        data: {
          runTimeMs: executionResult.runTimeMs,
          passed: false,
          errorMessage: executionResult.errorMessage,
          completedAt: new Date(),
        },
      }),
      EVALUATE_ATTEMPT_PERSIST_TIMEOUT_MS,
      `Timed out while persisting failed attempt result for ${attemptLabel}`,
    );

    this.logger.debug(
      `Persisted failed evaluate attempt result for ${attemptLabel}`,
    );
  }

  private async withRetryableTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timeoutId = setTimeout(() => {
            reject(new RetryableJobError(message));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
