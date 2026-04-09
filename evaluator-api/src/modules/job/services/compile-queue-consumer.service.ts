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
import { DockerfileDto, SourceFileDto } from '@evaluator/shared';
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
      },
    });
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
      await this.updateCompilationStatus(compilationId, 'FAILED');
      return { success: false };
    }

    const compiledFileInfo = await this.handleSuccessfulCompilation(
      context,
      sourceFile,
      outputFileName,
      logPrefix,
    );

    if (compiledFileInfo) {
      await this.updateCompilationStatus(
        compilationId,
        'SUCCESS',
        compiledFileInfo.compiledS3Key,
      );
    } else {
      await this.updateCompilationStatus(compilationId, 'FAILED');
    }

    return { success: compiledFileInfo !== null, compiledFileInfo };
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

  private async persistCompilationResults(
    context: CompilationContext,
    submissionId: string,
    compiledFiles: CompiledFileInfo[],
    totalSourceFiles: number,
  ): Promise<void> {
    const allFilesCompiled = compiledFiles.length === totalSourceFiles;
    const logS3Key = await this.uploadCompileLogs(context);

    await this.updateSubmissionStatus(submissionId, logS3Key, allFilesCompiled);
    await this.finalizeLogStream(
      context,
      allFilesCompiled ? 'SUCCESS' : 'FAILED',
    );
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
  ): Promise<void> {
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
  }

  private async finalizeLogStream(
    context: CompilationContext,
    finalStatus: string,
  ): Promise<void> {
    await this.redisLogService.publishEvent(context.submissionId, {
      type: 'complete',
      status: finalStatus,
    });
    await this.redisLogService.deleteBuffer(context.submissionId);
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
      await this.updateSubmissionFailureStatus(
        submissionId,
        logS3Key,
        errorMessage,
      );
    } catch (uploadError) {
      this.logger.error(
        `Failed to upload error logs: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`,
      );
      await this.updateSubmissionFailureStatus(
        submissionId,
        null,
        errorMessage,
      );
    }

    await this.finalizeLogStream(context, 'FAILED');
  }

  private async updateSubmissionFailureStatus(
    submissionId: string,
    logS3Key: string | null,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        compileStatus: 'FAILED',
        compileLogS3Key: logS3Key,
        compileCompletedAt: new Date(),
        compileError: errorMessage,
      },
    });
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

      const compilation = await this.prisma.compilation.create({
        data: {
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
    s3Key?: string,
  ): Promise<void> {
    const updateData: {
      status: typeof status;
      startedAt?: Date;
      completedAt?: Date;
      s3Key?: string;
    } = { status };

    if (status === 'IN_PROGRESS') {
      updateData.startedAt = new Date();
    }

    if (status === 'SUCCESS' || status === 'FAILED') {
      updateData.completedAt = new Date();
    }

    if (s3Key) {
      updateData.s3Key = s3Key;
    }

    await this.prisma.compilation.update({
      where: { id: compilationId },
      data: updateData,
    });

    this.logger.debug(`Updated compilation ${compilationId} to ${status}`);
  }
}
