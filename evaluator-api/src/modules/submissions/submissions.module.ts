import { Module } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TestCasesService } from '../test-cases/test-cases.service';

@Module({
  controllers: [SubmissionsController],
  providers: [SubmissionsService, PrismaService, TestCasesService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
