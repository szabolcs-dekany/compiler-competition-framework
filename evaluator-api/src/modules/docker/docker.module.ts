import { Module } from '@nestjs/common';
import { DockerService } from './docker.service';

@Module({
  controllers: [],
  providers: [DockerService],
  exports: [DockerService],
})
export class DockerModule {}
