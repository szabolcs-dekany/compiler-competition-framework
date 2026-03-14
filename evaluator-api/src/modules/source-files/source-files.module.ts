import { Module } from '@nestjs/common';
import { SourceFilesController } from './source-files.controller';
import { SourceFilesService } from './source-files.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageModule } from '../../common/storage/storage.module';
import { TestCasesModule } from '../test-cases/test-cases.module';

@Module({
  imports: [StorageModule, TestCasesModule],
  controllers: [SourceFilesController],
  providers: [SourceFilesService, PrismaService],
  exports: [SourceFilesService],
})
export class SourceFilesModule {}
