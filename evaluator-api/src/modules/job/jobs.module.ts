import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TestCasesService } from '../test-cases/test-cases.service';

@Module({
  controllers: [],
  providers: [PrismaService, TestCasesService],
  exports: [],
})
export class JobsModule {}
