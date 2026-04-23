import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import bull from 'bull';
import type { BuildLogEvent, DockerfileVersionDto } from '@evaluator/shared';
import { DockerBuildJobData } from '../dto/jobs.dto';
import { DockerfilesService } from '../../dockerfiles/dockerfiles.service';
import { StorageService } from '../../../common/storage/storage.service';
import { DockerService } from '../../docker/docker.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisLogService } from '../../../common/redis/redis-log.service';
import type { BuildContext } from '../types/dockerfile-queue-consumer.types';

@Processor('dockerfile')
export class DockerfileQueueConsumerService {
  private readonly logger = new Logger(DockerfileQueueConsumerService.name);

  constructor(
    private readonly dockerfilesService: DockerfilesService,
    private readonly storageService: StorageService,
    private readonly dockerService: DockerService,
    private readonly prisma: PrismaService,
    private readonly redisLogService: RedisLogService,
  ) {}

  @Process()
  async processDockerBuildJob(
    job: bull.Job<DockerBuildJobData>,
  ): Promise<void> {
    const ctx = this.createBuildContext(job);
    const dockerfile = await this.validateDockerfile(ctx);
    if (!dockerfile) {
      await this.handleValidationFailure(
        ctx,
        `Dockerfile not found or missing S3 key: ${ctx.dockerfileId}`,
      );
      return;
    }

    this.logger.log(
      `Processing docker build job for dockerfile: ${ctx.dockerfileId}`,
    );
    await this.initializeBuildStatus(ctx);

    try {
      const imageResult = await this.executeBuild(ctx, dockerfile);
      const logS3Key = await this.uploadBuildLogs(ctx);
      const version = await this.updateBuildStatus(ctx, 'SUCCESS', {
        imageName: imageResult.imageName,
        logS3Key,
      });
      await this.dockerfilesService.updateImageName(
        ctx.dockerfileId,
        imageResult.imageName,
      );
      this.logger.log(`Built and saved image: ${imageResult.imageName}`);
      await this.finalizeLogStream(ctx, version);
    } catch (error) {
      await this.handleBuildFailure(ctx, error);
    }
  }

  private createBuildContext(job: bull.Job<DockerBuildJobData>): BuildContext {
    const { dockerfileId, teamId, version } = job.data;
    return {
      dockerfileId,
      teamId,
      version,
      channel: `docker-build:${dockerfileId}:${version}`,
    };
  }

  private async validateDockerfile(
    ctx: BuildContext,
  ): Promise<{ s3Key: string } | null> {
    const dockerfile = await this.dockerfilesService.findOne(ctx.dockerfileId);

    if (!dockerfile || !dockerfile.s3Key) {
      this.logger.warn(
        `Dockerfile not found or missing S3 key: ${ctx.dockerfileId}`,
      );
      return null;
    }

    return { s3Key: dockerfile.s3Key };
  }

  private async initializeBuildStatus(ctx: BuildContext): Promise<void> {
    const version = await this.updateBuildStatus(ctx, 'BUILDING');
    await this.publishBuildEvent(ctx, {
      type: 'status',
      version,
    });
  }

  private async executeBuild(ctx: BuildContext, dockerfile: { s3Key: string }) {
    const dockerfileBuffer = await this.storageService.getFile(
      dockerfile.s3Key,
    );

    return this.dockerService.buildImage({
      dockerfileBuffer,
      version: ctx.version,
      teamId: ctx.teamId,
      dockerfileId: ctx.dockerfileId,
      onLog: (message) => {
        void this.redisLogService.appendLog(ctx.channel, message);
      },
    });
  }

  private async uploadBuildLogs(ctx: BuildContext): Promise<string> {
    const logS3Key = `dockerfiles/${ctx.teamId}/v${ctx.version}/build.log`;
    const logs = await this.redisLogService.getLogHistory(ctx.channel);
    await this.storageService.uploadFile(
      logS3Key,
      Buffer.from(logs.join('\n')),
      'text/plain',
    );
    return logS3Key;
  }

  private async updateBuildStatus(
    ctx: BuildContext,
    status: 'BUILDING' | 'SUCCESS' | 'FAILED',
    opts?: { imageName?: string | null; logS3Key?: string; error?: string },
  ): Promise<DockerfileVersionDto> {
    await this.prisma.dockerfileVersion.update({
      where: {
        dockerfileId_version: {
          dockerfileId: ctx.dockerfileId,
          version: ctx.version,
        },
      },
      data: {
        buildStatus: status,
        ...(status === 'BUILDING'
          ? {
              buildStartedAt: new Date(),
              buildCompletedAt: null,
              imageName: null,
              buildLogS3Key: null,
              buildError: null,
            }
          : {
              buildCompletedAt: new Date(),
            }),
        ...(opts && 'imageName' in opts
          ? { imageName: opts.imageName ?? null }
          : {}),
        ...(opts?.logS3Key && { buildLogS3Key: opts.logS3Key }),
        ...(opts?.error && { buildError: opts.error }),
      },
    });

    return this.dockerfilesService.getVersion(ctx.dockerfileId, ctx.version);
  }

  private async publishBuildEvent(
    ctx: BuildContext,
    event: Extract<BuildLogEvent, { type: 'status' | 'complete' }>,
  ): Promise<void> {
    await this.redisLogService.publishEvent(ctx.channel, event);
  }

  private async finalizeLogStream(
    ctx: BuildContext,
    version: DockerfileVersionDto,
  ): Promise<void> {
    await this.publishBuildEvent(ctx, {
      type: 'complete',
      version,
    });
  }

  private async handleValidationFailure(
    ctx: BuildContext,
    errorMessage: string,
  ): Promise<void> {
    this.logger.warn(errorMessage);

    const version = await this.updateBuildStatus(ctx, 'FAILED', {
      error: errorMessage,
    });
    await this.finalizeLogStream(ctx, version);
  }

  private async handleBuildFailure(
    ctx: BuildContext,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    this.logger.error(
      `Build failed for dockerfile ${ctx.dockerfileId}: ${errorMessage}`,
    );

    await this.redisLogService.appendLog(
      ctx.channel,
      `Build failed: ${errorMessage}`,
    );

    try {
      const logS3Key = await this.uploadBuildLogs(ctx);
      const version = await this.updateBuildStatus(ctx, 'FAILED', {
        logS3Key,
        error: errorMessage,
      });
      await this.finalizeLogStream(ctx, version);
    } catch (uploadError) {
      this.logger.error(
        `Failed to upload error logs: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`,
      );
      const version = await this.updateBuildStatus(ctx, 'FAILED', {
        error: errorMessage,
      });
      await this.finalizeLogStream(ctx, version);
    }
  }
}
