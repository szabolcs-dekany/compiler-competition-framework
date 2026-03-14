import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TeamsModule } from './modules/teams/teams.module';
import { TestCasesModule } from './modules/test-cases/test-cases.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TeamsModule,
    TestCasesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
