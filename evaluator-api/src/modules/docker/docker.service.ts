import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DockerService {
  private readonly logger = new Logger(DockerService.name);
  private readonly docker: Docker;

  constructor(private readonly config: ConfigService) {
    const path: string = this.config.get(
      'DOCKER_SOCKET_PATH',
      '/var/run/docker.sock',
    );

    this.docker = new Docker({ socketPath: path });

    await this.verifyConnection();
  }

  private async verifyConnection() {
    try {
      await this.docker.ping();
      this.logger.log('Docker connection established');
    } catch (error) {
      this.logger.error('Failed to connect to Docker daemon', error);
    }
  }
}
