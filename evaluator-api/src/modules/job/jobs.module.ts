import { Module } from '@nestjs/common';
import { CompileQueueConsumerService } from './services/compile-queue-consumer.service';
import { SubmissionsModule } from '../submissions/submissions.module';
import { SourceFilesModule } from '../source-files/source-files.module';
import { DockerfilesModule } from '../dockerfiles/dockerfiles.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    QueueModule,
    SubmissionsModule,
    SourceFilesModule,
    DockerfilesModule,
  ],
  controllers: [],
  providers: [CompileQueueConsumerService],
  exports: [],
})
export class JobsModule {}
