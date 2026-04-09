import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TeamsModule } from './modules/teams/teams.module';
import { TestCasesModule } from './modules/test-cases/test-cases.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { SourceFilesModule } from './modules/source-files/source-files.module';
import { DockerfilesModule } from './modules/dockerfiles/dockerfiles.module';
import { StorageModule } from './common/storage/storage.module';
import { TestCaseLoaderModule } from './common/test-case-loader/test-case-loader.module';
import { JobsModule } from './modules/job/jobs.module';
import { RedisLogModule } from './common/redis/redis-log.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule,
    RedisLogModule,
    TestCaseLoaderModule,
    TeamsModule,
    TestCasesModule,
    SubmissionsModule,
    SourceFilesModule,
    DockerfilesModule,
    JobsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
