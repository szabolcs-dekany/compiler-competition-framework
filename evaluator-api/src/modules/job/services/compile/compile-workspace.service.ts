import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
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

  cleanup(context: CompilationContext): void {
    if (fs.existsSync(context.tempDir)) {
      fs.rmSync(context.tempDir, { recursive: true, force: true });
      this.logger.debug(`Cleaned up temporary directory: ${context.tempDir}`);
    }
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
}
