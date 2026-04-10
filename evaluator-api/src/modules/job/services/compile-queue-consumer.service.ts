import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import bull from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import { CompileJobData } from '../dto/jobs.dto';
import { SubmissionsService } from '../../submissions/submissions.service';
import { SourceFilesService } from '../../source-files/source-files.service';
import { DockerfilesService } from '../../dockerfiles/dockerfiles.service';
import { Submission } from '@prisma/client';
import type {
  CompileLogEvent,
  DockerfileDto,
  SourceFileDto,
  SubmissionCompilationDto,
  SubmissionDto,
} from '@evaluator/shared';
import { DockerService } from '../../docker/docker.service';
import { StorageService } from '../../../common/storage/storage.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RedisLogService } from '../../../common/redis/redis-log.service';

interface CompilationContext {
  submissionId: string;
  teamId: string;
  version: number;
  jobId: string;
  tempDir: string;
}

interface CompilationResult {
  success: boolean;
  compileTimeMs: number;
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface CompiledFileInfo {
  sourceFileId: string;
  testCaseId: string;
  compiledS3Key: string;
}

@Processor('compile')
export class CompileQueueConsumerService {
  private readonly logger = new Logger(CompileQueueConsumerService.name);

  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly sourceFilesService: SourceFilesService,
    private readonly dockerfilesService: DockerfilesService,
    private readonly dockerService: DockerService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly redisLogService: RedisLogService,
  ) {}

  @Process()
  async processCompileJob(compileJob: bull.Job<CompileJobData>): Promise<void> {
    const { submissionId, teamId } = compileJob.data;
    const context = this.createCompilationContext(compileJob);

    this.logger.debug(`Compile queue job received: ${compileJob.id}`);

    try {
      const prerequisites = await this.validatePrerequisites(teamId);
      if (!prerequisites) {
        this.logger.warn(
          `Compile queue job ${compileJob.id} missing prerequisites for team ${teamId}`,
        );
        await this.handleCompilationFailure(
          context,
          submissionId,
          new Error(
            'Missing prerequisites: ensure a Dockerfile, Docker image, and source files exist',
          ),
        );
        return;
      }

      const compilationIdMap = await this.createPendingCompilations(
        context,
        prerequisites.sourceFiles,
      );

      await this.initializeJobState(submissionId);
      await this.prepareWorkspace(context, prerequisites);
      const compiledFiles = await this.compileAllSourceFiles(
        context,
        prerequisites,
        compilationIdMap,
      );
      await this.persistCompilationResults(
        context,
        submissionId,
        compiledFiles,
        prerequisites.sourceFiles.length,
      );
    } catch (error) {
      await this.handleCompilationFailure(context, submissionId, error);
    } finally {
      this.cleanupWorkspace(context);
    }
  }

  private createCompilationContext(
    compileJob: bull.Job<CompileJobData>,
  ): CompilationContext {
    const { submissionId, teamId, version } = compileJob.data;
    const tempDir = path.join(process.cwd(), 'tmp', String(compileJob.id));

    return {
      submissionId,
      teamId,
      version,
      jobId: String(compileJob.id),
      tempDir,
    };
  }

  private async appendLog(
    context: CompilationContext,
    message: string,
  ): Promise<void> {
    await this.redisLogService.appendLog(context.submissionId, message);
  }

  private async validatePrerequisites(teamId: string): Promise<{
    submission: Submission;
    dockerfile: DockerfileDto;
    sourceFiles: SourceFileDto[];
  } | null> {
    const [submission, dockerfile, sourceFiles] = await Promise.all([
      this.getLatestSubmission(teamId),
      this.getLatestDockerfile(teamId),
      this.sourceFilesService.findByTeamId(teamId),
    ]);

    if (
      !submission ||
      !dockerfile ||
      !sourceFiles ||
      sourceFiles.length === 0
    ) {
      return null;
    }

    if (!dockerfile.imageName) {
      this.logger.error(`No image name found for dockerfile: ${dockerfile.id}`);
      return null;
    }

    return { submission, dockerfile, sourceFiles };
  }

  private async initializeJobState(submissionId: string): Promise<void> {
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        compileStatus: 'RUNNING',
        compileStartedAt: new Date(),
        compileCompletedAt: null,
        compileLogS3Key: null,
        compileError: null,
      },
    });

    await this.publishSubmissionEvent(submissionId, 'status');
  }

  private async prepareWorkspace(
    context: CompilationContext,
    prerequisites: {
      submission: Submission;
      sourceFiles: SourceFileDto[];
    },
  ): Promise<void> {
    fs.mkdirSync(context.tempDir, { recursive: true });
    this.logger.debug(`Created temporary directory: ${context.tempDir}`);

    await this.downloadCompiler(context, prerequisites.submission);
    await this.downloadSourceFiles(context, prerequisites.sourceFiles);
  }

  private async downloadCompiler(
    context: CompilationContext,
    submission: Submission,
  ): Promise<void> {
    if (!submission.compilerPath) {
      throw new Error(
        `No compiler path available for submission ${submission.id}`,
      );
    }

    this.logger.debug(`Downloading compiler: ${submission.compilerPath}`);
    const compilerBuffer = await this.storageService.getFile(
      submission.compilerPath,
    );
    const compilerPath = path.join(context.tempDir, submission.originalName);
    fs.writeFileSync(compilerPath, compilerBuffer);
    fs.chmodSync(compilerPath, 0o755);
    this.logger.debug(`Compiler saved and executable: ${compilerPath}`);
  }

  private async downloadSourceFiles(
    context: CompilationContext,
    sourceFiles: SourceFileDto[],
  ): Promise<void> {
    for (const sourceFile of sourceFiles) {
      this.logger.debug(`Downloading source file: ${sourceFile.s3Key}`);
      const buffer = await this.storageService.getFile(sourceFile.s3Key);
      const filePath = path.join(context.tempDir, sourceFile.originalName);
      fs.writeFileSync(filePath, buffer);
      this.logger.debug(`Source file saved: ${filePath}`);
    }
  }

  private async compileAllSourceFiles(
    context: CompilationContext,
    prerequisites: {
      submission: Submission;
      dockerfile: DockerfileDto;
      sourceFiles: SourceFileDto[];
    },
    compilationIdMap: Map<string, string>,
  ): Promise<CompiledFileInfo[]> {
    const compileTimeoutMs = this.configService.get<number>(
      'DOCKER_COMPILE_TIMEOUT_MS',
      60000,
    );
    const compiledFiles: CompiledFileInfo[] = [];

    for (const sourceFile of prerequisites.sourceFiles) {
      const compilationId = compilationIdMap.get(sourceFile.id);
      if (!compilationId) {
        this.logger.error(
          `No compilation ID found for source file ${sourceFile.id}`,
        );
        continue;
      }

      const result = await this.compileSingleFile(
        context,
        prerequisites.submission,
        prerequisites.dockerfile.imageName!,
        sourceFile,
        compileTimeoutMs,
        compilationId,
      );

      if (result.success && result.compiledFileInfo) {
        compiledFiles.push(result.compiledFileInfo);
      }
    }

    return compiledFiles;
  }

  private async compileSingleFile(
    context: CompilationContext,
    submission: Submission,
    imageName: string,
    sourceFile: SourceFileDto,
    timeoutMs: number,
    compilationId: string,
  ): Promise<{ success: boolean; compiledFileInfo?: CompiledFileInfo | null }> {
    const logPrefix = `[${sourceFile.originalName}]`;
    const outputFileName = path.parse(sourceFile.originalName).name;

    try {
      await this.updateCompilationStatus(compilationId, 'IN_PROGRESS');
      await this.logCompilationStart(
        context,
        logPrefix,
        sourceFile,
        outputFileName,
      );

      const result = await this.executeCompilation(
        context,
        submission,
        imageName,
        sourceFile,
        outputFileName,
        timeoutMs,
      );

      await this.processCompilationOutput(context, logPrefix, result);

      if (result.exitCode !== 0) {
        this.logCompilationFailure(sourceFile, result);
        await this.updateCompilationStatus(compilationId, 'FAILED', {
          errorMessage: this.getCompilationFailureMessage(result),
        });
        return { success: false };
      }

      const compiledFileInfo = await this.handleSuccessfulCompilation(
        context,
        sourceFile,
        outputFileName,
        logPrefix,
      );

      if (compiledFileInfo) {
        await this.updateCompilationStatus(compilationId, 'SUCCESS', {
          s3Key: compiledFileInfo.compiledS3Key,
          errorMessage: null,
        });
      } else {
        await this.updateCompilationStatus(compilationId, 'FAILED', {
          errorMessage: `Compiled output not found: ${outputFileName}`,
        });
      }

      return { success: compiledFileInfo !== null, compiledFileInfo };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.appendLog(context, `${logPrefix} ERROR: ${errorMessage}`);
      await this.updateCompilationStatus(compilationId, 'FAILED', {
        errorMessage,
      });
      throw error;
    }
  }

  private async logCompilationStart(
    context: CompilationContext,
    logPrefix: string,
    sourceFile: SourceFileDto,
    outputFileName: string,
  ): Promise<void> {
    this.logger.debug(
      `Compiling: ${sourceFile.originalName} -> ${outputFileName}`,
    );
    await this.appendLog(
      context,
      `${logPrefix} Compiling ${sourceFile.originalName}`,
    );
    await this.appendLog(context, `${logPrefix} Output: ${outputFileName}`);
  }

  private async executeCompilation(
    context: CompilationContext,
    submission: Submission,
    imageName: string,
    sourceFile: SourceFileDto,
    outputFileName: string,
    timeoutMs: number,
  ): Promise<CompilationResult> {
    const startTime = Date.now();

    const dockerResult = await this.dockerService.runContainer({
      imageName,
      command: [
        `./${submission.originalName}`,
        'build',
        '-o',
        outputFileName,
        sourceFile.originalName,
      ],
      mountPath: context.tempDir,
      containerPath: '/workspace',
      submissionId: context.submissionId,
      timeoutMs,
      onLog: (message) => {
        void this.appendLog(context, message);
      },
    });

    return {
      success: dockerResult.exitCode === 0,
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
      const lines = result.stderr.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        await this.appendLog(context, `${logPrefix} [stderr] ${line}`);
      }
    }

    await this.appendLog(context, `${logPrefix} Exit code: ${result.exitCode}`);
  }

  private async handleSuccessfulCompilation(
    context: CompilationContext,
    sourceFile: SourceFileDto,
    outputFileName: string,
    logPrefix: string,
  ): Promise<CompiledFileInfo | null> {
    const compiledOutputPath = path.join(context.tempDir, outputFileName);

    if (!fs.existsSync(compiledOutputPath)) {
      await this.appendLog(
        context,
        `${logPrefix} ERROR: Compiled output not found: ${outputFileName}`,
      );
      this.logger.error(
        `Compiled output missing for ${sourceFile.originalName}`,
      );
      return null;
    }

    const compiledBuffer = fs.readFileSync(compiledOutputPath);
    const compiledS3Key = `compiled/${context.teamId}/v${context.version}/${outputFileName}`;

    await this.storageService.uploadFile(
      compiledS3Key,
      compiledBuffer,
      'application/octet-stream',
    );

    await this.appendLog(
      context,
      `${logPrefix} SUCCESS: Compiled binary uploaded to ${compiledS3Key}`,
    );
    this.logger.debug(
      `Compiled ${sourceFile.originalName} -> ${compiledS3Key}`,
    );

    return {
      sourceFileId: sourceFile.id,
      testCaseId: sourceFile.testCaseId,
      compiledS3Key,
    };
  }

  private logCompilationFailure(
    sourceFile: SourceFileDto,
    result: CompilationResult,
  ): void {
    this.logger.error(
      `Compilation failed for ${sourceFile.originalName} with exit code ${result.exitCode}`,
    );
  }

  private getCompilationFailureMessage(result: CompilationResult): string {
    const stderr = result.stderr.trim();

    if (stderr.length > 0) {
      return stderr;
    }

    return `Compilation failed with exit code ${result.exitCode}`;
  }

  private async persistCompilationResults(
    context: CompilationContext,
    submissionId: string,
    compiledFiles: CompiledFileInfo[],
    totalSourceFiles: number,
  ): Promise<void> {
    const allFilesCompiled = compiledFiles.length === totalSourceFiles;
    const logS3Key = await this.uploadCompileLogs(context);

    const submission = await this.updateSubmissionStatus(
      submissionId,
      logS3Key,
      allFilesCompiled,
    );
    await this.finalizeLogStream(submission);
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

  private async updateSubmissionStatus(
    submissionId: string,
    logS3Key: string,
    allFilesCompiled: boolean,
  ): Promise<SubmissionDto> {
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        compileStatus: allFilesCompiled ? 'SUCCESS' : 'FAILED',
        compileLogS3Key: logS3Key,
        compileCompletedAt: new Date(),
        compileError: allFilesCompiled
          ? null
          : 'One or more source files failed to compile',
      },
    });

    return this.submissionsService.getSubmissionDto(submissionId);
  }

  private async publishSubmissionEvent(
    submissionId: string,
    type: 'status' | 'complete',
  ): Promise<void> {
    const submission =
      await this.submissionsService.getSubmissionDto(submissionId);

    await this.redisLogService.publishEvent(submissionId, {
      type,
      submission,
    } satisfies Extract<CompileLogEvent, { type: 'status' | 'complete' }>);
  }

  private async publishCompilationStatusEvent(
    compilation: SubmissionCompilationDto,
  ): Promise<void> {
    await this.redisLogService.publishEvent(compilation.submissionId, {
      type: 'compilation-status',
      compilation,
    } satisfies Extract<CompileLogEvent, { type: 'compilation-status' }>);
  }

  private async finalizeLogStream(submission: SubmissionDto): Promise<void> {
    await this.redisLogService.publishEvent(submission.id, {
      type: 'complete',
      submission,
    } satisfies Extract<CompileLogEvent, { type: 'complete' }>);
  }

  private async refreshAndPublishCompilationStatus(
    compilationId: string,
  ): Promise<SubmissionCompilationDto> {
    const compilation =
      await this.submissionsService.getCompilationDto(compilationId);
    await this.publishCompilationStatusEvent(compilation);
    return compilation;
  }

  private async handleCompilationFailure(
    context: CompilationContext,
    submissionId: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    this.logger.error(
      `Compile job failed for submission ${submissionId}: ${errorMessage}`,
    );

    await this.appendLog(context, `ERROR: ${errorMessage}`);

    try {
      const logS3Key = await this.uploadCompileLogs(context);
      const submission = await this.updateSubmissionFailureStatus(
        submissionId,
        logS3Key,
        errorMessage,
      );
      await this.finalizeLogStream(submission);
    } catch (uploadError) {
      this.logger.error(
        `Failed to upload error logs: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`,
      );
      const submission = await this.updateSubmissionFailureStatus(
        submissionId,
        null,
        errorMessage,
      );
      await this.finalizeLogStream(submission);
    }
  }

  private async updateSubmissionFailureStatus(
    submissionId: string,
    logS3Key: string | null,
    errorMessage: string,
  ): Promise<SubmissionDto> {
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        compileStatus: 'FAILED',
        compileLogS3Key: logS3Key,
        compileCompletedAt: new Date(),
        compileError: errorMessage,
      },
    });

    return this.submissionsService.getSubmissionDto(submissionId);
  }

  private cleanupWorkspace(context: CompilationContext): void {
    if (fs.existsSync(context.tempDir)) {
      fs.rmSync(context.tempDir, { recursive: true, force: true });
      this.logger.debug(`Cleaned up temporary directory: ${context.tempDir}`);
    }
  }

  private async getLatestSubmission(
    teamId: string,
  ): Promise<Submission | undefined> {
    const submissions = await this.submissionsService.findByTeam(teamId);
    return submissions.at(0);
  }

  private async getLatestDockerfile(
    teamId: string,
  ): Promise<DockerfileDto | undefined> {
    const dockerfiles = await this.dockerfilesService.findAllByTeamId(teamId);
    return dockerfiles.at(0);
  }

  private async createPendingCompilations(
    context: CompilationContext,
    sourceFiles: SourceFileDto[],
  ): Promise<Map<string, string>> {
    const compilationIdMap = new Map<string, string>();

    for (const sourceFile of sourceFiles) {
      const sourceFileVersion = await this.prisma.sourceFileVersion.findUnique({
        where: {
          sourceFileId_version: {
            sourceFileId: sourceFile.id,
            version: sourceFile.version,
          },
        },
      });

      if (!sourceFileVersion) {
        this.logger.error(
          `Source file version not found: ${sourceFile.id} v${sourceFile.version}`,
        );
        continue;
      }

      const compilation = await this.prisma.compilation.upsert({
        where: {
          sourceFileVersionId_submissionId: {
            sourceFileVersionId: sourceFileVersion.id,
            submissionId: context.submissionId,
          },
        },
        update: {
          status: 'PENDING',
          s3Key: null,
          startedAt: null,
          completedAt: null,
          errorMessage: null,
        },
        create: {
          sourceFileVersionId: sourceFileVersion.id,
          submissionId: context.submissionId,
          status: 'PENDING',
        },
      });

      compilationIdMap.set(sourceFile.id, compilation.id);
      this.logger.debug(
        `Created compilation ${compilation.id} for source file ${sourceFile.id} v${sourceFile.version} with submission ${context.submissionId}`,
      );
    }

    return compilationIdMap;
  }

  private async updateCompilationStatus(
    compilationId: string,
    status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED',
    opts?: { s3Key?: string; errorMessage?: string | null },
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

    await this.refreshAndPublishCompilationStatus(compilationId);
    this.logger.debug(`Updated compilation ${compilationId} to ${status}`);
  }
}
