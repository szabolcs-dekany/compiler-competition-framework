import { Injectable, Logger } from '@nestjs/common';
import { chmod, mkdir, rm, writeFile } from 'fs/promises';
import * as path from 'path';
import { StorageService } from '../../../../common/storage/storage.service';
import type {
  CompilationContext,
  SnapshotCompilation,
  SubmissionSnapshot,
} from '../../types/compile-queue-consumer.types';

@Injectable()
export class CompileWorkspaceService {
  private readonly logger = new Logger(CompileWorkspaceService.name);

  constructor(private readonly storageService: StorageService) {}

  async prepare(
    context: CompilationContext,
    submission: SubmissionSnapshot,
  ): Promise<void> {
    await Promise.all([
      mkdir(context.tempDir, { recursive: true }),
      mkdir(context.scratchDir, { recursive: true }),
      mkdir(path.join(context.scratchDir, '.home'), { recursive: true }),
      mkdir(path.join(context.scratchDir, '.tmp'), { recursive: true }),
      mkdir(path.join(context.scratchDir, '.cache'), { recursive: true }),
      mkdir(path.join(context.scratchDir, '.cache', 'go-build'), {
        recursive: true,
      }),
      mkdir(path.join(context.scratchDir, '.cache', 'go-mod'), {
        recursive: true,
      }),
    ]);
    this.logger.debug(
      `Preparing compile workspace ${context.tempDir} for submission ${context.submissionId}`,
    );

    await this.downloadCompiler(context, submission);
    await this.downloadSourceFiles(context, submission.compilations);
  }

  async cleanup(context: CompilationContext): Promise<void> {
    await rm(context.tempDir, { recursive: true, force: true });
    this.logger.debug(`Cleaned up temporary directory: ${context.tempDir}`);
  }

  private async downloadCompiler(
    context: CompilationContext,
    submission: SubmissionSnapshot,
  ): Promise<void> {
    if (!submission.compilerPath) {
      throw new Error(
        `No compiler path available for submission ${context.submissionId}`,
      );
    }

    const compilerBuffer = await this.storageService.getFile(
      submission.compilerPath,
    );
    const compilerPath = path.join(context.tempDir, submission.originalName);

    await writeFile(compilerPath, compilerBuffer);
    await chmod(compilerPath, 0o755);
  }

  private async downloadSourceFiles(
    context: CompilationContext,
    compilations: SnapshotCompilation[],
  ): Promise<void> {
    for (const compilation of compilations) {
      const buffer = await this.storageService.getFile(compilation.s3Key);
      const filePath = path.join(context.tempDir, compilation.workspaceName);
      await writeFile(filePath, buffer);
    }
  }
}
