import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import bull from 'bull';
import { DockerBuildJobData } from '../dto/jobs.dto';
import { DockerfilesService } from '../../dockerfiles/dockerfiles.service';
import { StorageService } from '../../../common/storage/storage.service';
import { DockerService } from '../../docker/docker.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Processor('dockerfile')
export class DockerfileQueueConsumerService {
  private readonly logger = new Logger(DockerfileQueueConsumerService.name);

  constructor(
    private readonly dockerfilesService: DockerfilesService,
    private readonly storageService: StorageService,
    private readonly dockerService: DockerService,
    private readonly prisma: PrismaService,
  ) {}

  @Process()
  async processDockerBuildJob(dockerBuildJob: bull.Job<DockerBuildJobData>) {
    const { dockerfileId, teamId, version } = dockerBuildJob.data;

    const dockerFile = await this.dockerfilesService.findOne(dockerfileId);

    if (!dockerFile || !dockerFile.s3Key) {
      this.logger.warn(
        `Dockerfile not found or missing S3 key: ${dockerfileId}`,
      );
      return;
    }

    this.logger.log(
      `Processing docker build job for dockerfile: ${dockerfileId}`,
    );

    await this.prisma.dockerfileVersion.update({
      where: {
        dockerfileId_version: { dockerfileId, version },
      },
      data: {
        buildStatus: 'BUILDING',
        buildStartedAt: new Date(),
      },
    });

    try {
      const dockerfileBuffer = await this.storageService.getFile(
        dockerFile.s3Key,
      );

      const imageResult = await this.dockerService.buildImage({
        dockerfileBuffer,
        version,
        teamId,
        dockerfileId,
      });

      const logS3Key = `dockerfiles/${teamId}/v${version}/build.log`;
      await this.storageService.uploadFile(
        logS3Key,
        Buffer.from(imageResult.buildLog.join('\n')),
        'text/plain',
      );

      await this.prisma.dockerfileVersion.update({
        where: {
          dockerfileId_version: { dockerfileId, version },
        },
        data: {
          buildStatus: 'SUCCESS',
          buildLogS3Key: logS3Key,
          buildCompletedAt: new Date(),
        },
      });

      await this.dockerfilesService.updateImageName(
        dockerfileId,
        imageResult.imageName,
      );

      this.logger.log(`Built and saved image: ${imageResult.imageName}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Build failed for dockerfile ${dockerfileId}: ${errorMessage}`,
      );

      const logS3Key = `dockerfiles/${teamId}/v${version}/build.log`;
      await this.storageService
        .uploadFile(
          logS3Key,
          Buffer.from(`Build failed: ${errorMessage}`),
          'text/plain',
        )
        .catch(() => {});

      await this.prisma.dockerfileVersion.update({
        where: {
          dockerfileId_version: { dockerfileId, version },
        },
        data: {
          buildStatus: 'FAILED',
          buildLogS3Key: logS3Key,
          buildCompletedAt: new Date(),
          buildError: errorMessage,
        },
      });
    }
  }
}
