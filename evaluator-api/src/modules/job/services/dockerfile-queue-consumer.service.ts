import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import bull from 'bull';
import { DockerBuildJobData } from '../dto/jobs.dto';
import { DockerfilesService } from '../../dockerfiles/dockerfiles.service';
import { StorageService } from '../../../common/storage/storage.service';
import { DockerService } from '../../docker/docker.service';

@Processor('dockerfile')
export class DockerfileQueueConsumerService {
  private readonly logger = new Logger(DockerfileQueueConsumerService.name);

  constructor(
    private readonly dockerfilesService: DockerfilesService,
    private readonly storageService: StorageService,
    private readonly dockerService: DockerService,
  ) {}

  @Process()
  async processDockerBuildJob(dockerBuildJob: bull.Job<DockerBuildJobData>) {
    const dockerFile = await this.dockerfilesService.findOne(
      dockerBuildJob.data.dockerfileId,
    );

    const s3Url = dockerFile.s3Key;

    if (s3Url) {
      this.logger.log(
        `Processing docker build job for dockerfile: ${dockerFile.id}`,
      );

      const dockerfileBuffer = await this.storageService.getFile(s3Url);

      const imageResult = await this.dockerService.buildImage({
        dockerfileBuffer,
        version: dockerFile.version,
        teamId: dockerBuildJob.data.teamId,
      });

      await this.dockerfilesService.updateImageName(
        dockerFile.id,
        imageResult.imageName,
      );

      this.logger.log(`Built and saved image: ${imageResult.imageName}`);
    } else {
      this.logger.warn(
        `Compile queue job received without available submission: ${dockerBuildJob.id}`,
      );
    }
  }
}
