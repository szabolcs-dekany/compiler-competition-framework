import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import bull from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StorageService } from '../../../common/storage/storage.service';
import { RedisLogService } from '../../../common/redis/redis-log.service';
import { DockerService } from '../../docker/docker.service';
import { CompileJobData } from '../dto/jobs.dto';
import { EvaluateQueueService } from '../../queue/evaluate-queue.service';
import { SubmissionExecutionService } from '../../submissions/submission-execution.service';
import type {
  CompilationContext,
  CompilationResult,
  CompletedCompilation,
  SnapshotCompilation,
  SubmissionSnapshot,
  TeamLock,
  TeamLockHeartbeat,
} from '../types/compile-queue-consumer.types';

const DEFAULT_COMPILE_QUEUE_CONCURRENCY = 4;
const DEFAULT_TEAM_LOCK_TTL_MS = 15 * 60 * 1000;
const DEFAULT_TEAM_LOCK_POLL_MS = 1000;

function readPositiveIntEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const COMPILE_QUEUE_CONCURRENCY = readPositiveIntEnv(
  'COMPILE_QUEUE_CONCURRENCY',
  DEFAULT_COMPILE_QUEUE_CONCURRENCY,
);

@Processor('compile')
export class CompileQueueConsumerService {
  private readonly logger = new Logger(CompileQueueConsumerService.name);
  private readonly teamLockTtlMs: number;
  private readonly teamLockPollMs: number;

  constructor(
    private readonly submissionExecutionService: SubmissionExecutionService,
    private readonly evaluateQueueService: EvaluateQueueService,
    private readonly dockerService: DockerService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly redisLogService: RedisLogService,
  ) {
    this.teamLockTtlMs = this.configService.get<number>(
      'COMPILE_TEAM_LOCK_TTL_MS',
      DEFAULT_TEAM_LOCK_TTL_MS,
    );
    this.teamLockPollMs = this.configService.get<number>(
      'COMPILE_TEAM_LOCK_POLL_MS',
      DEFAULT_TEAM_LOCK_POLL_MS,
    );
  }

  @Process({ concurrency: COMPILE_QUEUE_CONCURRENCY })
  async processCompileJob(compileJob: bull.Job<CompileJobData>): Promise<void> {
    const context = this.createCompilationContext(compileJob);
    const lock = await this.waitForTeamLock(context);
    const heartbeat = this.startTeamLockHeartbeat(context, lock);

    this.logger.debug(
      `Compile queue job received: ${compileJob.id} for submission ${context.submissionId}`,
    );

    try {
      heartbeat.throwIfLockLost();
      const submission = await this.loadSubmissionSnapshot(
        context.submissionId,
      );
      this.validateSubmissionSnapshot(submission);

      await this.initializeJobState(context.submissionId);
      await this.prepareWorkspace(context, submission);
      heartbeat.throwIfLockLost();

      const successfulCompilations = await this.compileAllSourceFiles(
        context,
        submission,
      );
      heartbeat.throwIfLockLost();

      await this.persistCompilationResults(
        context,
        submission,
        successfulCompilations,
      );
    } catch (error) {
      await this.handleCompilationFailure(context, error);
    } finally {
      heartbeat.stop();
      await this.releaseTeamLock(context, lock);
      this.cleanupWorkspace(context);
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
      throw new Error(`Submission with id ${submissionId} not found`);
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
      throw new Error(
        `No compiler path available for submission ${submission.id}`,
      );
    }

    if (!submission.dockerImageName) {
      throw new Error(
        `No Docker image snapshot available for submission ${submission.id}`,
      );
    }

    if (submission.compilations.length === 0) {
      throw new Error(
        `No source file snapshots available for submission ${submission.id}`,
      );
    }
  }

  private async initializeJobState(submissionId: string): Promise<void> {
    await this.submissionExecutionService.markCompilationStarted(submissionId);
  }

  private async waitForTeamLock(
    context: CompilationContext,
  ): Promise<TeamLock> {
    const key = this.teamLockKey(context.teamId);
    const value = `${context.jobId}:${Date.now()}`;
    let waitingLogged = false;

    while (true) {
      const acquired = await this.redisLogService.acquireLock(
        key,
        value,
        this.teamLockTtlMs,
      );

      if (acquired) {
        this.logger.debug(
          `Compile team lock acquired for team ${context.teamId} by job ${context.jobId}`,
        );
        return { key, value };
      }

      if (!waitingLogged) {
        this.logger.debug(
          `Compile job ${context.jobId} waiting for team lock ${context.teamId}`,
        );
        waitingLogged = true;
      }

      await this.sleep(this.teamLockPollMs);
    }
  }

  private startTeamLockHeartbeat(
    context: CompilationContext,
    lock: TeamLock,
  ): TeamLockHeartbeat {
    let active = true;
    let lockLossError: Error | null = null;

    const heartbeatPromise = (async () => {
      while (active) {
        await this.sleep(Math.max(1000, Math.floor(this.teamLockTtlMs / 3)));
        if (!active) {
          break;
        }

        const extended = await this.redisLogService.extendLock(
          lock.key,
          lock.value,
          this.teamLockTtlMs,
        );

        if (!extended) {
          lockLossError = new Error(
            `Lost compile team lock for team ${context.teamId} while processing submission ${context.submissionId}`,
          );
          this.logger.error(lockLossError.message);
          active = false;
          break;
        }
      }
    })().catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown lock heartbeat error';
      lockLossError = new Error(message);
      this.logger.error(message);
    });

    return {
      stop: () => {
        active = false;
        void heartbeatPromise.catch(() => undefined);
      },
      throwIfLockLost: () => {
        if (lockLossError) {
          throw lockLossError;
        }
      },
    };
  }

  private async releaseTeamLock(
    context: CompilationContext,
    lock: TeamLock,
  ): Promise<void> {
    const released = await this.redisLogService.releaseLock(
      lock.key,
      lock.value,
    );

    if (!released) {
      this.logger.warn(
        `Compile team lock for team ${context.teamId} was already released before job ${context.jobId} finished`,
      );
      return;
    }

    this.logger.debug(
      `Compile team lock released for team ${context.teamId} by job ${context.jobId}`,
    );
  }

  private teamLockKey(teamId: string): string {
    return `lock:compile:team:${teamId}`;
  }

  private async sleep(durationMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, durationMs));
  }

  private async prepareWorkspace(
    context: CompilationContext,
    submission: SubmissionSnapshot,
  ): Promise<void> {
    fs.mkdirSync(context.tempDir, { recursive: true });
    fs.mkdirSync(context.scratchDir, { recursive: true });
    fs.mkdirSync(path.join(context.scratchDir, '.home'), { recursive: true });
    fs.mkdirSync(path.join(context.scratchDir, '.tmp'), { recursive: true });
    fs.mkdirSync(path.join(context.scratchDir, '.cache'), { recursive: true });
    fs.mkdirSync(path.join(context.scratchDir, '.cache', 'go-build'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(context.scratchDir, '.cache', 'go-mod'), {
      recursive: true,
    });
    this.logger.debug(
      `Preparing compile workspace ${context.tempDir} for submission ${context.submissionId}`,
    );

    await this.downloadCompiler(context, submission);
    await this.downloadSourceFiles(context, submission.compilations);
  }

  private async downloadCompiler(
    context: CompilationContext,
    submission: SubmissionSnapshot,
  ): Promise<void> {
    const compilerBuffer = await this.storageService.getFile(
      submission.compilerPath as string,
    );
    const compilerPath = path.join(context.tempDir, submission.originalName);

    fs.writeFileSync(compilerPath, compilerBuffer);
    fs.chmodSync(compilerPath, 0o755);
  }

  private async downloadSourceFiles(
    context: CompilationContext,
    compilations: SnapshotCompilation[],
  ): Promise<void> {
    for (const compilation of compilations) {
      const buffer = await this.storageService.getFile(compilation.s3Key);
      const filePath = path.join(context.tempDir, compilation.workspaceName);
      fs.writeFileSync(filePath, buffer);
    }
  }

  private async compileAllSourceFiles(
    context: CompilationContext,
    submission: SubmissionSnapshot,
  ): Promise<CompletedCompilation[]> {
    const compileTimeoutMs = this.configService.get<number>(
      'DOCKER_COMPILE_TIMEOUT_MS',
      120000,
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

    const dockerResult = await this.dockerService.runContainer({
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
      onLog: (message) => {
        void this.appendLog(context, message);
      },
    });

    return {
      compileTimeMs: Date.now() - startTime,
      stdout: dockerResult.stdout,
      stderr: dockerResult.stderr,
      exitCode: dockerResult.exitCode,
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
    const logS3Key = await this.uploadCompileLogs(context);
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

  private async uploadCompileLogs(
    context: CompilationContext,
  ): Promise<string> {
    const logS3Key = `compiles/${context.teamId}/v${context.version}/compile.log`;
    const logs = await this.redisLogService.getLogHistory(context.submissionId);

    await this.storageService.uploadFile(
      logS3Key,
      Buffer.from(logs.join('\n')),
      'text/plain',
    );

    return logS3Key;
  }

  private async handleCompilationFailure(
    context: CompilationContext,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    await this.appendLog(context, `ERROR: ${errorMessage}`);

    try {
      const logS3Key = await this.uploadCompileLogs(context);
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

  private async appendLog(
    context: CompilationContext,
    message: string,
  ): Promise<void> {
    await this.redisLogService.appendLog(context.submissionId, message);
  }

  private cleanupWorkspace(context: CompilationContext): void {
    if (fs.existsSync(context.tempDir)) {
      fs.rmSync(context.tempDir, { recursive: true, force: true });
      this.logger.debug(`Cleaned up temporary directory: ${context.tempDir}`);
    }
  }
}
