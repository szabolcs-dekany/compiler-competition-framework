import { Module } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { SubmissionReaderService } from './submission-reader.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TestCasesService } from '../test-cases/test-cases.service';
import { QueueModule } from '../queue/queue.module';
import { SubmissionExecutionService } from './submission-execution.service';
import { SubmissionEventsService } from './submission-events.service';

@Module({
  imports: [QueueModule],
  controllers: [SubmissionsController],
  providers: [
    SubmissionReaderService,
    SubmissionsService,
    PrismaService,
    TestCasesService,
    SubmissionExecutionService,
    SubmissionEventsService,
  ],
  exports: [
    SubmissionReaderService,
    SubmissionsService,
    SubmissionExecutionService,
    SubmissionEventsService,
  ],
})
export class SubmissionsModule {}
