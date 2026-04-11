import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { StorageService } from '../../../../common/storage/storage.service';
import type {
  CompilationSnapshot,
  EvaluationContext,
} from '../../types/evaluate-queue-consumer.types';

@Injectable()
export class EvaluateWorkspaceService {
  private readonly logger = new Logger(EvaluateWorkspaceService.name);

  constructor(private readonly storageService: StorageService) {}

  async prepare(
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

  cleanup(context: EvaluationContext): void {
    if (fs.existsSync(context.tempDir)) {
      fs.rmSync(context.tempDir, { recursive: true, force: true });
    }

    if (fs.existsSync(context.scratchRootDir)) {
      fs.rmSync(context.scratchRootDir, { recursive: true, force: true });
    }
  }
}
