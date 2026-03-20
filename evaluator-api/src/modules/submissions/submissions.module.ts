import { Module } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TestCasesService } from '../test-cases/test-cases.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, PrismaService, TestCasesService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
