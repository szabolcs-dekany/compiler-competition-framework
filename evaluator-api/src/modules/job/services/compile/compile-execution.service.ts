import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { StorageService } from '../../../../common/storage/storage.service';
import { RedisLogService } from '../../../../common/redis/redis-log.service';
import { DockerService } from '../../../docker/docker.service';
import { SubmissionExecutionService } from '../../../submissions/submission-execution.service';
import type {
  CompilationContext,
  CompilationResult,
  CompletedCompilation,
  SnapshotCompilation,
  SubmissionSnapshot,
} from '../../types/compile-queue-consumer.types';

@Injectable()
export class CompileExecutionService {
  private readonly logger = new Logger(CompileExecutionService.name);

  constructor(
    private readonly dockerService: DockerService,
    private readonly storageService: StorageService,
    private readonly redisLogService: RedisLogService,
    private readonly submissionExecutionService: SubmissionExecutionService,
    private readonly configService: ConfigService,
  ) {}

  async compileAll(
    context: CompilationContext,
    submission: SubmissionSnapshot,
  ): Promise<CompletedCompilation[]> {
    const compileTimeoutMs = this.configService.get<number>(
      'DOCKER_COMPILE_TIMEOUT_MS',
      240_000,
    );
    const compileMemoryMb = this.configService.get<number>(
      'DOCKER_COMPILE_MEMORY_MB',
      1024,
    );
    const completedCompilations: CompletedCompilation[] = [];

    for (const compilation of submission.compilations) {
      const completedCompilation = await this.compileSingleFile(
        context,
        submission,
        compilation,
        compileTimeoutMs,
        compileMemoryMb,
      );

      if (completedCompilation) {
        completedCompilations.push(completedCompilation);
      }
    }

    return completedCompilations;
  }

  async uploadLogs(context: CompilationContext): Promise<string> {
    const logS3Key = `compiles/${context.teamId}/v${context.version}/compile.log`;
    const logs = await this.redisLogService.getLogHistory(context.submissionId);

    await this.storageService.uploadFile(
      logS3Key,
      Buffer.from(logs.join('\n')),
      'text/plain',
    );

    return logS3Key;
  }

  private async compileSingleFile(
    context: CompilationContext,
    submission: SubmissionSnapshot,
    compilation: SnapshotCompilation,
    timeoutMs: number,
    memoryMb: number,
  ): Promise<CompletedCompilation | null> {
    const logPrefix = `[${compilation.originalName}]`;
    const outputFileName = `compiled-${compilation.testCaseId}`;

    try {
      await this.submissionExecutionService.updateCompilationStatus(
        compilation.id,
        'IN_PROGRESS',
      );
      await this.appendLog(
        context,
        `${logPrefix} Compiling ${compilation.originalName} -> ${outputFileName}`,
      );

      const result = await this.executeCompilation(
        context,
        submission,
        compilation,
        outputFileName,
        timeoutMs,
        memoryMb,
      );

      await this.processCompilationOutput(context, logPrefix, result);

      if (result.exitCode !== 0) {
        const errorMessage = this.getCompilationFailureMessage(result);

        await this.submissionExecutionService.updateCompilationStatus(
          compilation.id,
          'FAILED',
          {
            errorMessage,
          },
        );
        return {
          compilationId: compilation.id,
          succeeded: false,
        };
      }

      const compiledS3Key = await this.uploadCompiledBinary(
        context,
        compilation,
        outputFileName,
        logPrefix,
      );

      await this.submissionExecutionService.updateCompilationStatus(
        compilation.id,
        'SUCCESS',
        {
          s3Key: compiledS3Key,
          errorMessage: null,
        },
      );
      return {
        compilationId: compilation.id,
        succeeded: true,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.appendLog(context, `${logPrefix} ERROR: ${errorMessage}`);
      await this.submissionExecutionService.updateCompilationStatus(
        compilation.id,
        'FAILED',
        {
          errorMessage,
        },
      );
      throw error;
    }
  }

  private async executeCompilation(
    context: CompilationContext,
    submission: SubmissionSnapshot,
    compilation: SnapshotCompilation,
    outputFileName: string,
    timeoutMs: number,
    memoryMb: number,
  ): Promise<CompilationResult> {
    const startTime = Date.now();
    const pendingLogWrites: Promise<void>[] = [];
    let dockerResult: Awaited<
      ReturnType<DockerService['runContainer']>
    > | null = null;
    let executionError: unknown = null;
    let appendLogError: unknown = null;

    try {
      dockerResult = await this.dockerService.runContainer({
        imageName: submission.dockerImageName as string,
        command: [
          `./${submission.originalName}`,
          'build',
          '-o',
          outputFileName,
          compilation.workspaceName,
        ],
        mountPath: context.tempDir,
        containerPath: '/workspace',
        scratchHostPath: context.scratchDir,
        scratchContainerPath: '/scratch',
        env: [
          'HOME=/scratch/.home',
          'TMPDIR=/scratch/.tmp',
          'TMP=/scratch/.tmp',
          'TEMP=/scratch/.tmp',
          'XDG_CACHE_HOME=/scratch/.cache',
          'GOCACHE=/scratch/.cache/go-build',
          'GOMODCACHE=/scratch/.cache/go-mod',
          'GOTMPDIR=/scratch/.tmp',
        ],
        timeoutMs,
        memoryMb,
        tmpfsSizeMb: memoryMb,
        onLog: (message) => {
          const appendPromise = this.appendLog(context, message).catch(
            (error: unknown) => {
              const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
              this.logger.error(
                `Failed to append compile log for submission ${context.submissionId}: ${errorMessage}`,
              );
              throw error;
            },
          );

          pendingLogWrites.push(appendPromise);
        },
      });
    } catch (error) {
      executionError = error;
    }

    try {
      await Promise.all(pendingLogWrites);
    } catch (error) {
      appendLogError = error;
    }

    if (executionError) {
      throw executionError;
    }

    if (appendLogError) {
      throw appendLogError;
    }

    return {
      compileTimeMs: Date.now() - startTime,
      stdout: dockerResult?.stdout ?? '',
      stderr: dockerResult?.stderr ?? '',
      exitCode: dockerResult?.exitCode ?? -1,
    };
  }

  private async processCompilationOutput(
    context: CompilationContext,
    logPrefix: string,
    result: CompilationResult,
  ): Promise<void> {
    await this.appendLog(
      context,
      `${logPrefix} Compile time: ${result.compileTimeMs}ms`,
    );

    if (result.stderr) {
      const lines = result.stderr.split('\n').filter((line) => line.trim());
      for (const line of lines) {
        await this.appendLog(context, `${logPrefix} [stderr] ${line}`);
      }
    }

    await this.appendLog(context, `${logPrefix} Exit code: ${result.exitCode}`);
  }

  private getCompilationFailureMessage(result: CompilationResult): string {
    const stderr = result.stderr.trim();
    return stderr.length > 0
      ? stderr
      : `Compilation failed with exit code ${result.exitCode}`;
  }

  private async uploadCompiledBinary(
    context: CompilationContext,
    compilation: SnapshotCompilation,
    outputFileName: string,
    logPrefix: string,
  ): Promise<string> {
    const compiledOutputPath = path.join(context.tempDir, outputFileName);

    if (!fs.existsSync(compiledOutputPath)) {
      throw new Error(`Compiled output not found: ${outputFileName}`);
    }

    const compiledBuffer = fs.readFileSync(compiledOutputPath);
    const compiledS3Key = `compiled/${context.teamId}/v${context.version}/${compilation.testCaseId}`;

    await this.storageService.uploadFile(
      compiledS3Key,
      compiledBuffer,
      'application/octet-stream',
    );
    await this.appendLog(
      context,
      `${logPrefix} SUCCESS: Compiled binary uploaded to ${compiledS3Key}`,
    );

    return compiledS3Key;
  }

  private async appendLog(
    context: CompilationContext,
    message: string,
  ): Promise<void> {
    await this.redisLogService.appendLog(context.submissionId, message);
  }
}
