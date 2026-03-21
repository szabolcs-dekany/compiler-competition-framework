import { Module } from '@nestjs/common';
import { CompileQueueConsumerService } from './services/compile-queue-consumer.service';
import { SubmissionsModule } from '../submissions/submissions.module';
import { SourceFilesModule } from '../source-files/source-files.module';
import { DockerfilesModule } from '../dockerfiles/dockerfiles.module';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../../common/storage/storage.module';
import { DockerModule } from '../docker/docker.module';
import { DockerfileQueueConsumerService } from './services/dockerfile-queue-consumer.service';

@Module({
  imports: [
    QueueModule,
    SubmissionsModule,
    SourceFilesModule,
    DockerfilesModule,
    StorageModule,
    DockerModule,
  ],
  controllers: [],
  providers: [CompileQueueConsumerService, DockerfileQueueConsumerService],
  exports: [],
})
export class JobsModule {}
