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
  Sse,
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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, fromEvent, map, takeUntil, of, concat } from 'rxjs';
import type {
  SubmissionCompilationDto,
  CompileLogEvent,
} from '@evaluator/shared';
import { SubmissionsService } from './submissions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { Submission } from './entities/submission.entity';

@ApiTags('submissions')
@Controller('submissions')
export class SubmissionsController {
  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
          description: 'Compiler file',
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

  @Get(':id/compilations')
  @ApiOperation({
    summary: 'Get compilation status per test case for a submission',
  })
  @ApiParam({ name: 'id', description: 'Submission ID' })
  @ApiResponse({
    status: 200,
    description: 'List of compilation statuses with test case details',
  })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  findCompilations(
    @Param('id') id: string,
  ): Promise<SubmissionCompilationDto[]> {
    return this.submissionsService.findCompilations(id);
  }

  @Get(':id/compile-logs')
  @ApiOperation({ summary: 'Get stored compile logs for a submission' })
  @ApiParam({ name: 'id', description: 'Submission ID' })
  @ApiResponse({ status: 200, description: 'Compile logs' })
  @ApiResponse({ status: 404, description: 'Logs not found' })
  async getCompileLogs(@Param('id') id: string): Promise<{ logs: string }> {
    const logs = await this.submissionsService.getCompileLogs(id);
    return { logs };
  }

  @Sse(':id/compile-logs/stream')
  @ApiOperation({ summary: 'Stream compile logs via Server-Sent Events' })
  @ApiParam({ name: 'id', description: 'Submission ID' })
  streamCompileLogs(
    @Param('id') id: string,
  ): Observable<{ data: CompileLogEvent }> {
    const submission = this.submissionsService.findOne(id);
    const eventTopic = `compile-log:${id}`;
    const completeTopic = `${eventTopic}:complete`;

    const logStream$ = fromEvent(this.eventEmitter, eventTopic).pipe(
      map((event: unknown) => ({ data: event as CompileLogEvent })),
      takeUntil(fromEvent(this.eventEmitter, completeTopic)),
    );

    return concat(
      of({ data: { type: 'status', status: 'RUNNING' } as CompileLogEvent }),
      logStream$,
    );
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
