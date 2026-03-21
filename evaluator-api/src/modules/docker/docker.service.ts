import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';
import { ConfigService } from '@nestjs/config';
import * as tar from 'tar-stream';
import { Readable } from 'stream';

export interface BuildImageParams {
  dockerfileBuffer: Buffer;
  teamId: string;
  version: number;
}

export interface BuildImageResult {
  imageName: string;
  buildLog: string[];
}

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

    void this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.docker.ping();
      this.logger.log('Docker connection established');
    } catch (error) {
      this.logger.error('Failed to connect to Docker daemon', error);
    }
  }

  async buildImage(params: BuildImageParams): Promise<BuildImageResult> {
    const { dockerfileBuffer, teamId, version } = params;
    const imageName = `team-${teamId}:v${version}`;

    this.logger.log(`Building Docker image: ${imageName}`);

    const tarBuffer = await this.createTarFromDockerfile(dockerfileBuffer);
    const tarStream = Readable.from(tarBuffer);

    const stream = await this.docker.buildImage(tarStream, { t: imageName });

    const buildLog = await this.followBuildProgress(stream, imageName);

    this.logger.log(`Successfully built image: ${imageName}`);

    return { imageName, buildLog };
  }

  private async createTarFromDockerfile(
    dockerfileBuffer: Buffer,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pack = tar.pack();

      pack.entry(
        { name: 'Dockerfile', size: dockerfileBuffer.length },
        dockerfileBuffer,
        (err) => {
          if (err) {
            reject(err);
            return;
          }

          pack.finalize();
        },
      );

      const chunks: Buffer[] = [];
      pack.on('data', (chunk: Buffer) => chunks.push(chunk));
      pack.on('end', () => resolve(Buffer.concat(chunks)));
      pack.on('error', reject);
    });
  }

  private followBuildProgress(
    stream: NodeJS.ReadableStream,
    imageName: string,
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const buildLog: string[] = [];

      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => {
          if (err) {
            this.logger.error(`Build failed for ${imageName}: ${err.message}`);
            reject(err);
          } else {
            resolve(buildLog);
          }
        },
        (event: { stream?: string; error?: string; status?: string }) => {
          if (event.stream) {
            const message = event.stream.trim();
            if (message) {
              buildLog.push(message);
              this.logger.debug(`[${imageName}] ${message}`);
            }
          }
          if (event.error) {
            buildLog.push(`ERROR: ${event.error}`);
            this.logger.error(`[${imageName}] ${event.error}`);
          }
          if (event.status) {
            this.logger.debug(`[${imageName}] ${event.status}`);
          }
        },
      );
    });
  }
}
