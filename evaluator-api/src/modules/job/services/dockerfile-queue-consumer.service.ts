import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import bull from 'bull';
import { DockerBuildJobData } from '../dto/jobs.dto';
import { DockerfilesService } from '../../dockerfiles/dockerfiles.service';
import { StorageService } from '../../../common/storage/storage.service';

@Processor('dockerfile')
export class DockerfileQueueConsumerService {
  private readonly logger = new Logger(DockerfileQueueConsumerService.name);

  constructor(
    private readonly dockerfilesService: DockerfilesService,
    private readonly storageService: StorageService,
  ) {}

  @Process({ concurrency: 1 })
  async processDockerBuildJob(compileJob: bull.Job<DockerBuildJobData>) {
    const dockerFile = await this.dockerfilesService.findOne(
      compileJob.data.dockerfileId,
    );

    const s3Url = dockerFile.s3Key;

    if (s3Url) {
      this.logger.log(
        `Processing docker build job for dockerfile: ${dockerFile.id}`,
      );

      const dockerfileBuffer = await this.storageService.getFile(s3Url);
    } else {
      this.logger.warn(
        `Compile queue job received without available submission: ${compileJob.id}`,
      );
    }
  }
}
