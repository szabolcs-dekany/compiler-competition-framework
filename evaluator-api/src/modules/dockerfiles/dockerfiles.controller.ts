import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  Header,
  NotFoundException,
  Sse,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import type {
  DockerfileVersionDto,
  DockerfileListDto,
  BuildLogEvent,
} from '@evaluator/shared';
import { RedisLogService } from '../../common/redis/redis-log.service';
import { DockerfilesService } from './dockerfiles.service';
import { DockerfileEntity } from './entities/dockerfile.entity';
import { DockerfileVersionEntity } from './entities/dockerfile-version.entity';
import { DockerfileListEntity } from './entities/dockerfile-list.entity';

@ApiTags('dockerfiles')
@Controller('dockerfiles')
export class DockerfilesController {
  private readonly logger = new Logger(DockerfilesController.name);

  constructor(
    private readonly dockerfilesService: DockerfilesService,
    private readonly redisLogService: RedisLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all Dockerfiles' })
  @ApiResponse({
    status: 200,
    description: 'List of all Dockerfiles',
    type: [DockerfileListEntity],
  })
  async findAll(): Promise<DockerfileListDto[]> {
    return this.dockerfilesService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Upload a Dockerfile for a team' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'teamId', required: true, description: 'Team ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Dockerfile (must be named exactly "Dockerfile")',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Dockerfile uploaded',
    type: DockerfileEntity,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file name or team not found',
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Query('teamId') teamId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DockerfileEntity> {
    return this.dockerfilesService.create({ teamId }, file);
  }

  @Get('by-team')
  @ApiOperation({ summary: 'Get Dockerfile for a team' })
  @ApiQuery({ name: 'teamId', required: true, description: 'Team ID' })
  @ApiResponse({
    status: 200,
    description: 'Dockerfile details',
    type: DockerfileEntity,
  })
  @ApiResponse({ status: 404, description: 'No Dockerfile found for team' })
  async findByTeamId(
    @Query('teamId') teamId: string,
  ): Promise<DockerfileEntity> {
    const dockerfile = await this.dockerfilesService.findByTeamId(teamId);
    if (!dockerfile) {
      throw new NotFoundException(`No Dockerfile found for team ${teamId}`);
    }
    return dockerfile;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a Dockerfile by ID' })
  @ApiParam({ name: 'id', description: 'Dockerfile ID' })
  @ApiResponse({
    status: 200,
    description: 'Dockerfile details',
    type: DockerfileEntity,
  })
  @ApiResponse({ status: 404, description: 'Dockerfile not found' })
  async findOne(@Param('id') id: string): Promise<DockerfileEntity> {
    return this.dockerfilesService.findOne(id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Get version history for a Dockerfile' })
  @ApiParam({ name: 'id', description: 'Dockerfile ID' })
  @ApiResponse({
    status: 200,
    description: 'Version history',
    type: [DockerfileVersionEntity],
  })
  @ApiResponse({ status: 404, description: 'Dockerfile not found' })
  async getVersions(@Param('id') id: string): Promise<DockerfileVersionDto[]> {
    return this.dockerfilesService.getVersions(id);
  }

  @Get(':id/versions/:version')
  @ApiOperation({ summary: 'Get a specific version of a Dockerfile' })
  @ApiParam({ name: 'id', description: 'Dockerfile ID' })
  @ApiParam({ name: 'version', description: 'Version number' })
  @ApiResponse({
    status: 200,
    description: 'Version details',
    type: DockerfileVersionEntity,
  })
  @ApiResponse({ status: 404, description: 'Dockerfile or version not found' })
  async getVersion(
    @Param('id') id: string,
    @Param('version') version: string,
  ): Promise<DockerfileVersionDto> {
    const versionNum = parseInt(version, 10);
    return this.dockerfilesService.getVersion(id, versionNum);
  }

  @Get(':id/versions/:version/logs')
  @ApiOperation({ summary: 'Get stored build logs for a version' })
  @ApiParam({ name: 'id', description: 'Dockerfile ID' })
  @ApiParam({ name: 'version', description: 'Version number' })
  @ApiResponse({ status: 200, description: 'Build logs' })
  @ApiResponse({ status: 404, description: 'Logs not found' })
  async getBuildLogs(
    @Param('id') id: string,
    @Param('version') version: string,
  ): Promise<{ logs: string }> {
    const versionNum = parseInt(version, 10);
    const logs = await this.dockerfilesService.getBuildLogs(id, versionNum);
    return { logs };
  }

  @Sse(':id/versions/:version/logs/stream')
  @ApiOperation({ summary: 'Stream build logs via Server-Sent Events' })
  @ApiParam({ name: 'id', description: 'Dockerfile ID' })
  @ApiParam({ name: 'version', description: 'Version number' })
  async streamBuildLogs(
    @Param('id') id: string,
    @Param('version') version: string,
  ): Promise<Observable<{ data: BuildLogEvent }>> {
    const versionNum = parseInt(version, 10);
    const channel = `docker-build:${id}:${versionNum}`;
    const versionData = await this.dockerfilesService.getVersion(
      id,
      versionNum,
    );

    return new Observable<{ data: BuildLogEvent }>((subscriber) => {
      subscriber.next({
        data: {
          type: 'status',
          version: versionData,
        },
      });

      const unsubscribePromise =
        this.redisLogService.subscribeWithReplay<BuildLogEvent>(
          channel,
          (event) => {
            subscriber.next({ data: event });

            if (event.type === 'complete') {
              stopStream();
              subscriber.complete();
            }
          },
        );

      let stopped = false;

      const stopStream = (): void => {
        if (stopped) {
          return;
        }

        stopped = true;

        void unsubscribePromise
          .then((unsubscribe) => unsubscribe())
          .catch((error: unknown) => {
            const message =
              error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(
              `Failed to close build log stream for ${channel}: ${message}`,
            );
          });
      };

      void unsubscribePromise.catch((error: unknown) => {
        if (stopped) {
          return;
        }

        const streamError =
          error instanceof Error ? error : new Error('Failed to stream logs');
        this.logger.error(
          `Failed to start build log stream for ${channel}: ${streamError.message}`,
        );
        subscriber.error(streamError);
      });

      return () => {
        stopStream();
      };
    });
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download Dockerfile content (latest version)' })
  @ApiParam({ name: 'id', description: 'Dockerfile ID' })
  @ApiResponse({ status: 200, description: 'Dockerfile content' })
  @ApiResponse({ status: 404, description: 'Dockerfile not found' })
  @Header('Content-Type', 'application/octet-stream')
  async download(@Param('id') id: string): Promise<StreamableFile> {
    const { buffer, fileName } = await this.dockerfilesService.download(id);
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get(':id/versions/:version/download')
  @ApiOperation({ summary: 'Download a specific version of a Dockerfile' })
  @ApiParam({ name: 'id', description: 'Dockerfile ID' })
  @ApiParam({ name: 'version', description: 'Version number' })
  @ApiResponse({ status: 200, description: 'Dockerfile version content' })
  @ApiResponse({ status: 404, description: 'Dockerfile or version not found' })
  @Header('Content-Type', 'application/octet-stream')
  async downloadVersion(
    @Param('id') id: string,
    @Param('version') version: string,
  ): Promise<StreamableFile> {
    const versionNum = parseInt(version, 10);
    const { buffer, fileName } = await this.dockerfilesService.downloadVersion(
      id,
      versionNum,
    );
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Replace a Dockerfile' })
  @ApiParam({ name: 'id', description: 'Dockerfile ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'New Dockerfile (must be named exactly "Dockerfile")',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Dockerfile replaced',
    type: DockerfileEntity,
  })
  @ApiResponse({ status: 400, description: 'Invalid file name' })
  @ApiResponse({ status: 404, description: 'Dockerfile not found' })
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DockerfileEntity> {
    return this.dockerfilesService.update(id, file);
  }
}
