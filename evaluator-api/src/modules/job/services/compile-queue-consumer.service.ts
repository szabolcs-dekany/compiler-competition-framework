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

@Processor('compile')
export class CompileQueueConsumerService {
  private readonly logger = new Logger(CompileQueueConsumerService.name);
  private readonly docker: Docker;

  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly sourceFilesService: SourceFilesService,
    private readonly dockerfilesService: DockerfilesService,
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
      //1. Read the dockerfile contents as a string
      //2. Get the latest source file for each testCaseId
      //3. Create a temporary directory which identifies this job
      //4. Save the source files to this temporary directory, into a source-files folder.
      //5. Download and save the submission compiler into a compiler folder inside the temporary directory.
      //6. Create an image from the dockerfile and save the image name it into the dockerfile.entity.ts as a new field, you will probably need to do some migration
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
