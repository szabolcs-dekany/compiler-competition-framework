import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TeamsModule } from './modules/teams/teams.module';
import { TestCasesModule } from './modules/test-cases/test-cases.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { SourceFilesModule } from './modules/source-files/source-files.module';
import { StorageModule } from './common/storage/storage.module';
import { TestCaseLoaderModule } from './common/test-case-loader/test-case-loader.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule,
    TestCaseLoaderModule,
    TeamsModule,
    TestCasesModule,
    SubmissionsModule,
    SourceFilesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
