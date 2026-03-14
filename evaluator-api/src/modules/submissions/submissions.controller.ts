import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { SubmissionsService } from './submissions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { Submission } from './entities/submission.entity';

@ApiTags('submissions')
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a compiler for a team' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team ID' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Compiler archive (tar.gz)',
        },
      },
      required: ['teamId', 'file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Submission created',
    type: Submission,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or missing file' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @Body() createSubmissionDto: CreateSubmissionDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<Submission> {
    if (!file) {
      throw new BadRequestException('Compiler file is required');
    }

    return this.submissionsService.create(createSubmissionDto, file);
  }

  @Get()
  @ApiOperation({ summary: 'List all submissions' })
  @ApiResponse({
    status: 200,
    description: 'List of submissions',
    type: [Submission],
  })
  findAll(): Promise<Submission[]> {
    return this.submissionsService.findAll();
  }

  @Get('team/:teamId')
  @ApiOperation({ summary: 'List submissions for a team' })
  @ApiParam({ name: 'teamId', description: 'Team ID' })
  @ApiResponse({
    status: 200,
    description: 'List of team submissions',
    type: [Submission],
  })
  findByTeam(@Param('teamId') teamId: string): Promise<Submission[]> {
    return this.submissionsService.findByTeam(teamId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a submission by ID' })
  @ApiParam({ name: 'id', description: 'Submission ID' })
  @ApiResponse({
    status: 200,
    description: 'Submission details',
    type: Submission,
  })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  async findOne(@Param('id') id: string): Promise<Submission> {
    const submission = await this.submissionsService.findOne(id);
    if (!submission) {
      throw new NotFoundException(`Submission with id ${id} not found`);
    }
    return submission;
  }
}
