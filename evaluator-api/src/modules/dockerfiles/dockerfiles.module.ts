import { Module } from '@nestjs/common';
import { DockerfilesController } from './dockerfiles.controller';
import { DockerfilesService } from './dockerfiles.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageModule } from '../../common/storage/storage.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [StorageModule, QueueModule],
  controllers: [DockerfilesController],
  providers: [DockerfilesService, PrismaService],
  exports: [DockerfilesService],
})
export class DockerfilesModule {}
