import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { TestCaseExecutionService } from '../../../../common/test-case-execution/test-case-execution.service';
import type {
  GeneratedAttempt,
  TestRunSummary,
} from '../../../../common/test-case-execution/test-case-execution.types';
import type { TestCase } from '../../../../common/test-case-loader/test-case-loader.types';
import { DockerService } from '../../../docker/docker.service';
import type {
  CompilationSnapshot,
  EvaluationContext,
} from '../../types/evaluate-queue-consumer.types';

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
}
