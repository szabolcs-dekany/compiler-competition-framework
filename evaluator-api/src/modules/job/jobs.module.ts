import { Module } from '@nestjs/common';
import { CompileQueueConsumerService } from './consumers/compile-queue-consumer.service';
import { SubmissionsModule } from '../submissions/submissions.module';
import { SourceFilesModule } from '../source-files/source-files.module';
import { DockerfilesModule } from '../dockerfiles/dockerfiles.module';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../../common/storage/storage.module';
import { DockerModule } from '../docker/docker.module';
import { DockerfileQueueConsumerService } from './consumers/dockerfile-queue-consumer.service';
import { EvaluateQueueConsumerService } from './consumers/evaluate-queue-consumer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TestRunExecutionService } from './services/test-run-execution.service';
import { CompileTeamLockService } from './services/compile/compile-team-lock.service';
import { CompileWorkspaceService } from './services/compile/compile-workspace.service';
import { CompileExecutionService } from './services/compile/compile-execution.service';
import { EvaluateWorkspaceService } from './services/evaluate/evaluate-workspace.service';
import { EvaluateAttemptService } from './services/evaluate/evaluate-attempt.service';

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
  providers: [
    CompileTeamLockService,
    CompileWorkspaceService,
    CompileExecutionService,
    CompileQueueConsumerService,
    DockerfileQueueConsumerService,
    EvaluateWorkspaceService,
    EvaluateAttemptService,
    EvaluateQueueConsumerService,
    TestRunExecutionService,
    PrismaService,
  ],
  exports: [],
})
export class JobsModule {}
