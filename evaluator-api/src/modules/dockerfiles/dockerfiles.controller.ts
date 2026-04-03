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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, fromEvent, map, takeUntil, of, concat } from 'rxjs';
import { DockerfilesService } from './dockerfiles.service';
import { DockerfileEntity } from './entities/dockerfile.entity';
import { DockerfileVersionEntity } from './entities/dockerfile-version.entity';
import { DockerfileListEntity } from './entities/dockerfile-list.entity';
import type {
  DockerfileVersionDto,
  DockerfileListDto,
  BuildLogEvent,
} from '@evaluator/shared';

@ApiTags('dockerfiles')
@Controller('dockerfiles')
export class DockerfilesController {
  constructor(
    private readonly dockerfilesService: DockerfilesService,
    private readonly eventEmitter: EventEmitter2,
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
  streamBuildLogs(
    @Param('id') id: string,
    @Param('version') version: string,
  ): Observable<{ data: BuildLogEvent }> {
    const versionNum = parseInt(version, 10);
    const eventTopic = `docker-build:${id}:${versionNum}`;
    const completeTopic = `${eventTopic}:complete`;

    const logStream$ = fromEvent(this.eventEmitter, eventTopic).pipe(
      map((event: unknown) => ({ data: event as BuildLogEvent })),
      takeUntil(fromEvent(this.eventEmitter, completeTopic)),
    );

    return concat(
      of({ data: { type: 'status', status: 'BUILDING' } as BuildLogEvent }),
      logStream$,
    );
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
