import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Sse,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import type {
  CompileLogEvent,
  SubmissionCompilationDto,
  TestRunAttemptDto,
  TestRunDto,
} from '@evaluator/shared';
import { RedisLogService } from '../../common/redis/redis-log.service';
import { isCompileLogEvent } from '../../common/redis/stream-event-guards';
import { SubmissionsService } from './submissions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { Submission } from './entities/submission.entity';

@ApiTags('submissions')
@Controller('submissions')
export class SubmissionsController {
  private readonly logger = new Logger(SubmissionsController.name);

  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly redisLogService: RedisLogService,
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

  @Get(':id/test-runs')
  @ApiOperation({ summary: 'Get evaluation summaries for a submission' })
  @ApiParam({ name: 'id', description: 'Submission ID' })
  @ApiResponse({
    status: 200,
    description: 'List of evaluation summaries',
  })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  findTestRuns(@Param('id') id: string): Promise<TestRunDto[]> {
    return this.submissionsService.findTestRuns(id);
  }

  @Get(':id/test-runs/:testCaseId/attempts')
  @ApiOperation({
    summary: 'Get generated attempts for a submission test case',
  })
  @ApiParam({ name: 'id', description: 'Submission ID' })
  @ApiParam({ name: 'testCaseId', description: 'Test case ID' })
  @ApiResponse({
    status: 200,
    description: 'List of attempt details',
  })
  @ApiResponse({ status: 404, description: 'Test run not found' })
  findTestRunAttempts(
    @Param('id') id: string,
    @Param('testCaseId') testCaseId: string,
  ): Promise<TestRunAttemptDto[]> {
    return this.submissionsService.getTestRunAttempts(id, testCaseId);
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
  async streamCompileLogs(
    @Param('id') id: string,
  ): Promise<Observable<{ data: CompileLogEvent }>> {
    const submission = await this.submissionsService.getSubmissionDto(id);

    return new Observable<{ data: CompileLogEvent }>((subscriber) => {
      subscriber.next({
        data: {
          type: 'status',
          submission,
        },
      });

      const unsubscribePromise =
        this.redisLogService.subscribeWithReplay<CompileLogEvent>(
          id,
          (event) => {
            subscriber.next({ data: event });

            if (event.type === 'complete') {
              stopStream();
              subscriber.complete();
            }
          },
          '0',
          isCompileLogEvent,
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
              `Failed to close compile log stream for ${id}: ${message}`,
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
          `Failed to start compile log stream for ${id}: ${streamError.message}`,
        );
        subscriber.error(streamError);
      });

      return () => {
        stopStream();
      };
    });
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
