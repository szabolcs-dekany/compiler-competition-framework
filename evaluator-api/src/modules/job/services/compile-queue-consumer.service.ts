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
import { DockerfileDto } from '@evaluator/shared';
import { DockerService } from '../../docker/docker.service';
import { StorageService } from '../../../common/storage/storage.service';

@Processor('compile')
export class CompileQueueConsumerService {
  private readonly logger = new Logger(CompileQueueConsumerService.name);

  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly sourceFilesService: SourceFilesService,
    private readonly dockerfilesService: DockerfilesService,
    private readonly dockerService: DockerService,
    private readonly storageService: StorageService,
  ) {}

  @Process()
  async processCompileJob(compileJob: bull.Job<CompileJobData>) {
    this.logger.debug(`Compile queue job received: ${compileJob.id}`);
    const latestSubmission = await this.getLatestSubmission(
      compileJob.data.teamId,
    );

    const latestDockerFile = await this.getLatestDockerfile(
      compileJob.data.teamId,
    );

    const sourceFiles = await this.sourceFilesService.findByTeamId(
      compileJob.data.teamId,
    );

    if (
      !latestSubmission ||
      !latestDockerFile ||
      !sourceFiles ||
      sourceFiles.length === 0
    ) {
      this.logger.warn(
        `Compile queue job received without available submission: ${compileJob.id}`,
      );
      return;
    }

    const imageName = latestDockerFile.imageName;
    if (!imageName) {
      this.logger.error(
        `No image name found for dockerfile: ${latestDockerFile.id}`,
      );
      return;
    }

    const tempDir = path.join(process.cwd(), 'tmp', String(compileJob.id));

    try {
      fs.mkdirSync(tempDir, { recursive: true });
      this.logger.debug(`Created temporary directory: ${tempDir}`);

      if (latestSubmission.compilerPath) {
        this.logger.debug(
          `Downloading compiler binary: ${latestSubmission.compilerPath}`,
        );
        const compilerBuffer = await this.storageService.getFile(
          latestSubmission.compilerPath,
        );
        const compilerPath = path.join(tempDir, latestSubmission.originalName);
        fs.writeFileSync(compilerPath, compilerBuffer);
        fs.chmodSync(compilerPath, 0o755);
        this.logger.debug(
          `Compiler binary saved and made executable: ${compilerPath}`,
        );
      }

      for (const sourceFile of sourceFiles) {
        this.logger.debug(`Downloading source file: ${sourceFile.s3Key}`);
        const sourceFileBuffer = await this.storageService.getFile(
          sourceFile.s3Key,
        );
        const filePath = path.join(tempDir, sourceFile.originalName);
        fs.writeFileSync(filePath, sourceFileBuffer);
        this.logger.debug(`Source file saved: ${filePath}`);
      }

      for (const sourceFile of sourceFiles) {
        this.logger.debug(
          `Running source file: ${sourceFile.originalName} with args 6 7`,
        );
        const result = await this.dockerService.runContainer({
          imageName,
          command: [
            `./${latestSubmission.originalName}`,
            `run`,
            sourceFile.originalName,
            '6',
            '7',
          ],
          mountPath: tempDir,
          containerPath: '/workspace',
        });

        this.logger.log(
          `Output for ${sourceFile.originalName}:\n` +
            `  stdout: ${result.stdout}\n` +
            `  stderr: ${result.stderr}\n` +
            `  exitCode: ${result.exitCode}`,
        );
      }
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        this.logger.debug(`Cleaned up temporary directory: ${tempDir}`);
      }
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
}
