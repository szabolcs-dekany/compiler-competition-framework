import { Injectable } from '@nestjs/common';
import { chmod, mkdir, rm, writeFile } from 'fs/promises';
import * as path from 'path';
import { StorageService } from '../../../../common/storage/storage.service';
import type {
  CompilationSnapshot,
  EvaluationContext,
} from '../../types/evaluate-queue-consumer.types';

@Injectable()
export class EvaluateWorkspaceService {
  constructor(private readonly storageService: StorageService) {}

  async prepare(
    context: EvaluationContext,
    compilation: CompilationSnapshot,
  ): Promise<string> {
    if (!compilation.compiledS3Key) {
      throw new Error(
        `No compiled binary available for compilation ${compilation.id}`,
      );
    }

    await Promise.all([
      mkdir(context.tempDir, { recursive: true }),
      mkdir(context.scratchRootDir, { recursive: true }),
    ]);

    const compiledBuffer = await this.storageService.getFile(
      compilation.compiledS3Key,
    );
    const binaryName = `binary-${compilation.testCaseId}`;
    const binaryPath = path.join(context.tempDir, binaryName);

    await writeFile(binaryPath, compiledBuffer);
    await chmod(binaryPath, 0o755);

    return binaryName;
  }

  async cleanup(context: EvaluationContext): Promise<void> {
    await Promise.all([
      rm(context.tempDir, { recursive: true, force: true }),
      rm(context.scratchRootDir, { recursive: true, force: true }),
    ]);
  }
}
