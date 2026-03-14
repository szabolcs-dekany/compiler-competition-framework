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
import { SourceFilesService } from './source-files.service';
import { UploadSourceFileDto } from './dto/upload-source-file.dto';
import { SourceFileEntity } from './entities/source-file.entity';
import { SourceFileVersionEntity } from './entities/source-file-version.entity';
import type {
  SourceFileListDto,
  SourceFileVersionDto,
} from '@evaluator/shared';

@ApiTags('source-files')
@Controller('source-files')
export class SourceFilesController {
  constructor(private readonly sourceFilesService: SourceFilesService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a source file for a test case' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['teamId', 'testCaseId', 'file'],
      properties: {
        teamId: { type: 'string', description: 'Team ID' },
        testCaseId: { type: 'string', description: 'Test case ID' },
        file: { type: 'string', format: 'binary', description: 'Source file' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Source file uploaded',
    type: SourceFileEntity,
  })
  @ApiResponse({ status: 404, description: 'Team or test case not found' })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Body() dto: UploadSourceFileDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<SourceFileEntity> {
    return this.sourceFilesService.create(dto, file);
  }

  @Get()
  @ApiOperation({ summary: 'List all source files for a team' })
  @ApiQuery({ name: 'teamId', required: true, description: 'Team ID' })
  @ApiResponse({ status: 200, description: 'List of source files' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async findAll(@Query('teamId') teamId: string): Promise<SourceFileListDto> {
    return this.sourceFilesService.findAll(teamId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a source file by ID' })
  @ApiParam({ name: 'id', description: 'Source file ID' })
  @ApiResponse({
    status: 200,
    description: 'Source file details',
    type: SourceFileEntity,
  })
  @ApiResponse({ status: 404, description: 'Source file not found' })
  async findOne(@Param('id') id: string): Promise<SourceFileEntity> {
    return this.sourceFilesService.findOne(id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Get version history for a source file' })
  @ApiParam({ name: 'id', description: 'Source file ID' })
  @ApiResponse({
    status: 200,
    description: 'Version history',
    type: [SourceFileVersionEntity],
  })
  @ApiResponse({ status: 404, description: 'Source file not found' })
  async getVersions(@Param('id') id: string): Promise<SourceFileVersionDto[]> {
    return this.sourceFilesService.getVersions(id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download source file content (latest version)' })
  @ApiParam({ name: 'id', description: 'Source file ID' })
  @ApiResponse({ status: 200, description: 'Source file content' })
  @ApiResponse({ status: 404, description: 'Source file not found' })
  @Header('Content-Type', 'application/octet-stream')
  async download(@Param('id') id: string): Promise<StreamableFile> {
    const { buffer, fileName } = await this.sourceFilesService.download(id);
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get(':id/versions/:version/download')
  @ApiOperation({ summary: 'Download a specific version of a source file' })
  @ApiParam({ name: 'id', description: 'Source file ID' })
  @ApiParam({ name: 'version', description: 'Version number' })
  @ApiResponse({ status: 200, description: 'Source file version content' })
  @ApiResponse({ status: 404, description: 'Source file or version not found' })
  @Header('Content-Type', 'application/octet-stream')
  async downloadVersion(
    @Param('id') id: string,
    @Param('version') version: string,
  ): Promise<StreamableFile> {
    const versionNum = parseInt(version, 10);
    const { buffer, fileName } = await this.sourceFilesService.downloadVersion(
      id,
      versionNum,
    );
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Replace a source file' })
  @ApiParam({ name: 'id', description: 'Source file ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'New source file',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Source file replaced',
    type: SourceFileEntity,
  })
  @ApiResponse({ status: 404, description: 'Source file not found' })
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<SourceFileEntity> {
    return this.sourceFilesService.update(id, file);
  }
}
