import { Injectable } from '@nestjs/common';
import type { CompileLogEvent } from '@evaluator/shared';
import { RedisLogService } from '../../common/redis/redis-log.service';
import { SubmissionsService } from './submissions.service';

@Injectable()
export class SubmissionEventsService {
  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly redisLogService: RedisLogService,
  ) {}

  async publishSubmissionEvent(
    submissionId: string,
    type: 'status' | 'complete',
  ): Promise<void> {
    const submission =
      await this.submissionsService.getSubmissionDto(submissionId);

    await this.redisLogService.publishEvent(submissionId, {
      type,
      submission,
    } satisfies Extract<CompileLogEvent, { type: 'status' | 'complete' }>);
  }

  async publishCompilationStatus(compilationId: string): Promise<void> {
    const compilation =
      await this.submissionsService.getCompilationDto(compilationId);

    await this.redisLogService.publishEvent(compilation.submissionId, {
      type: 'compilation-status',
      compilation,
    } satisfies Extract<CompileLogEvent, { type: 'compilation-status' }>);
  }

  async publishTestRunStatus(testRunId: string): Promise<void> {
    const testRun = await this.submissionsService.getTestRunDto(testRunId);

    await this.redisLogService.publishEvent(testRun.submissionId, {
      type: 'test-run-status',
      testRun,
    } satisfies Extract<CompileLogEvent, { type: 'test-run-status' }>);
  }
}
