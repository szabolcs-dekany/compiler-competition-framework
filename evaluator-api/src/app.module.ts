import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TeamsModule } from './modules/teams/teams.module';
import { TestCasesModule } from './modules/test-cases/test-cases.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { StorageModule } from './common/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule,
    TeamsModule,
    TestCasesModule,
    SubmissionsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
