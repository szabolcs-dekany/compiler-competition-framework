import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TeamsModule } from './modules/teams/teams.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), TeamsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
