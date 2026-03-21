import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import bull from 'bull';
import { CompileJobData } from '../dto/jobs.dto';
import { SubmissionsService } from '../../submissions/submissions.service';
import { SourceFilesService } from '../../source-files/source-files.service';
import { DockerfilesService } from '../../dockerfiles/dockerfiles.service';
import * as Docker from 'dockerode';
import { Submission } from '@prisma/client';
import { DockerfileDto } from '@evaluator/shared';
import { DockerService } from '../../docker/docker.service';
import { StorageService } from '../../../common/storage/storage.service';

@Processor('compile')
export class CompileQueueConsumerService {
  private readonly logger = new Logger(CompileQueueConsumerService.name);
  private readonly docker: Docker;

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
      latestSubmission &&
      latestDockerFile &&
      sourceFiles &&
      sourceFiles.length > 0
    ) {
      const temporaryFolder = `tmp/${compileJob.id}`;
      for (const sourceFile of sourceFiles) {
        this.logger.debug(
          `Downloading source file: ${sourceFile.s3Key} to temporary folder`,
        );
        const sourceFileBuffer = this.storageService.getFile(sourceFile.s3Key);
        const imageName = latestDockerFile.imageName;
        const commandToRun = '';
      }
    } else {
      this.logger.warn(
        `Compile queue job received without available submission: ${compileJob.id}`,
      );
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
