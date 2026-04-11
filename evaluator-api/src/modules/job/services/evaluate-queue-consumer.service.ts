import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import bull from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TestCaseExecutionService } from '../../../common/test-case-execution/test-case-execution.service';
import type { GeneratedAttempt } from '../../../common/test-case-execution/test-case-execution.types';
import { TestCaseLoaderService } from '../../../common/test-case-loader/test-case-loader.service';
import type { TestCase } from '../../../common/test-case-loader/test-case-loader.types';
import { StorageService } from '../../../common/storage/storage.service';
import { DockerService } from '../../docker/docker.service';
import { EvaluateJobData } from '../dto/jobs.dto';
import { TestRunExecutionService } from './test-run-execution.service';
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
    private readonly dockerService: DockerService,
    private readonly storageService: StorageService,
    private readonly testCaseLoader: TestCaseLoaderService,
    private readonly testCaseExecutionService: TestCaseExecutionService,
  ) {}

  @Process({ concurrency: EVALUATE_QUEUE_CONCURRENCY })
  async processEvaluateJob(job: bull.Job<EvaluateJobData>): Promise<void> {
    const context = this.createContext(job);

    try {
      const compilation = await this.loadCompilationSnapshot(
        context.compilationId,
      );
      const testCase = this.testCaseLoader.get(compilation.testCaseId);

      if (!testCase) {
        throw new Error(
          `Test case with id ${compilation.testCaseId} not found`,
        );
      }

      await this.testRunExecutionService.markSubmissionEvaluating(
        compilation.submissionId,
      );

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

      const attempts = await this.ensureAttempts(testRun.id, testCase);
      const binaryName = await this.prepareWorkspace(context, compilation);

      for (const attempt of attempts) {
        await this.runAttempt(
          context,
          compilation,
          testRun.id,
          testCase,
          binaryName,
          attempt,
        );
      }

      const completedAttempts = await this.prisma.testRunAttempt.findMany({
        where: { testRunId: testRun.id },
        orderBy: { attemptIndex: 'asc' },
      });
      const summary = this.testCaseExecutionService.summarizeResults(
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

      await this.testRunExecutionService.finalizeSubmissionIfComplete(
        compilation.submissionId,
      );
    } catch (error) {
      await this.handleEvaluationFailure(context, error);
    } finally {
      this.cleanupWorkspace(context);
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
      throw new Error(`Compilation with id ${compilationId} not found`);
    }

    if (compilation.status === 'SUCCESS' && !compilation.s3Key) {
      throw new Error(
        `No compiled binary available for compilation ${compilationId}`,
      );
    }

    if (
      compilation.status === 'SUCCESS' &&
      !compilation.submission.dockerImageName
    ) {
      throw new Error(
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

  private async ensureAttempts(
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

  private async prepareWorkspace(
    context: EvaluationContext,
    compilation: CompilationSnapshot,
  ): Promise<string> {
    fs.mkdirSync(context.tempDir, { recursive: true });
    fs.mkdirSync(context.scratchRootDir, { recursive: true });

    const compiledBuffer = await this.storageService.getFile(
      compilation.compiledS3Key as string,
    );
    const binaryName = `binary-${compilation.testCaseId}`;
    const binaryPath = path.join(context.tempDir, binaryName);

    fs.writeFileSync(binaryPath, compiledBuffer);
    fs.chmodSync(binaryPath, 0o755);

    return binaryName;
  }

  private async runAttempt(
    context: EvaluationContext,
    compilation: CompilationSnapshot,
    testRunId: string,
    testCase: TestCase,
    binaryName: string,
    attempt: GeneratedAttempt,
  ): Promise<void> {
    const startTime = Date.now();
    const attemptScratchDir = path.join(
      context.scratchRootDir,
      `attempt-${attempt.attemptIndex}`,
    );

    try {
      fs.mkdirSync(attemptScratchDir, { recursive: true });
      fs.mkdirSync(path.join(attemptScratchDir, '.home'), { recursive: true });
      fs.mkdirSync(path.join(attemptScratchDir, '.tmp'), { recursive: true });

      this.logger.debug(`Test Case args: ${attempt.stdin}`);

      const testArgs = attempt?.stdin?.split(' ') || [];

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
        readOnlyMount: true,
      });
      const runTimeMs = Date.now() - startTime;
      const passed = this.testCaseExecutionService.validateAttempt(
        testCase,
        attempt,
        dockerResult.stdout,
        dockerResult.exitCode,
      );

      await this.prisma.testRunAttempt.update({
        where: {
          testRunId_attemptIndex: {
            testRunId,
            attemptIndex: attempt.attemptIndex,
          },
        },
        data: {
          actualStdout: dockerResult.stdout,
          actualStderr: dockerResult.stderr,
          actualExitCode: dockerResult.exitCode,
          runTimeMs,
          passed,
          errorMessage: passed
            ? null
            : dockerResult.exitCode === -1
              ? `Execution timed out after ${testCase.timeout_ms}ms`
              : 'Output mismatch',
          completedAt: new Date(),
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown evaluation error';

      await this.prisma.testRunAttempt.update({
        where: {
          testRunId_attemptIndex: {
            testRunId,
            attemptIndex: attempt.attemptIndex,
          },
        },
        data: {
          runTimeMs: Date.now() - startTime,
          passed: false,
          errorMessage,
          completedAt: new Date(),
        },
      });
    } finally {
      if (fs.existsSync(attemptScratchDir)) {
        fs.rmSync(attemptScratchDir, { recursive: true, force: true });
      }
    }
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

  private cleanupWorkspace(context: EvaluationContext): void {
    if (fs.existsSync(context.tempDir)) {
      fs.rmSync(context.tempDir, { recursive: true, force: true });
    }

    if (fs.existsSync(context.scratchRootDir)) {
      fs.rmSync(context.scratchRootDir, { recursive: true, force: true });
    }
  }
}
