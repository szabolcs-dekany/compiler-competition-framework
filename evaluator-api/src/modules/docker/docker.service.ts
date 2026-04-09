import { Injectable, Logger } from '@nestjs/common';
import type { Container } from 'dockerode';
import Docker from 'dockerode';
import { ConfigService } from '@nestjs/config';
import * as tar from 'tar-stream';
import { Readable } from 'stream';

export interface BuildImageParams {
  dockerfileBuffer: Buffer;
  teamId: string;
  version: number;
  dockerfileId: string;
  onLog?: (message: string) => void;
}

export interface BuildImageResult {
  imageName: string;
  buildLog: string[];
}

export interface RunContainerParams {
  imageName: string;
  command: string[];
  mountPath: string;
  containerPath: string;
  submissionId?: string;
  version?: number;
  timeoutMs?: number;
  onLog?: (message: string) => void;
}

export interface RunContainerResult {
  stdout: string;
  stderr: string;
  exitCode: number;
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
    const { dockerfileBuffer, teamId, version, onLog } = params;
    const imageName = `team-${teamId}:v${version}`;

    this.logger.log(`Building Docker image: ${imageName}`);

    const tarBuffer = await this.createTarFromDockerfile(dockerfileBuffer);
    const tarStream = Readable.from(tarBuffer);

    const stream = await this.docker.buildImage(tarStream, { t: imageName });

    const buildLog = await this.followBuildProgress(stream, imageName, onLog);

    this.logger.log(`Successfully built image: ${imageName}`);

    return { imageName, buildLog };
  }

  async runContainer(params: RunContainerParams): Promise<RunContainerResult> {
    const { imageName, command, mountPath, containerPath, timeoutMs } = params;

    this.logger.debug(
      `Running container ${imageName} with command: ${command.join(' ')}`,
    );

    const container: Container = await this.docker.createContainer({
      Image: imageName,
      Cmd: command,
      WorkingDir: containerPath,
      HostConfig: {
        Binds: [`${mountPath}:${containerPath}`],
      },
    });

    let timeoutId: NodeJS.Timeout | undefined;
    let timedOut = false;

    try {
      await container.start();

      if (timeoutMs) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          this.logger.warn(
            `Container ${imageName} timed out after ${timeoutMs}ms, killing...`,
          );
          container.kill().catch((err) => {
            const errorMessage =
              err instanceof Error ? err.message : 'Unknown error';
            this.logger.error(`Failed to kill container: ${errorMessage}`);
          });
        }, timeoutMs);
      }

      const stream = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
      });

      const chunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          if (params.onLog) {
            const output = chunk.toString('utf-8');
            const lines = output.split('\n').filter((line) => line.trim());
            for (const line of lines) {
              const parsed = this.parseDockerLogLine(line);
              if (parsed) {
                params.onLog(parsed);
              }
            }
          }
        });
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      const output = Buffer.concat(chunks).toString('utf-8');

      const result = (await container.wait()) as { StatusCode?: number };
      const exitCode = timedOut ? -1 : (result.StatusCode ?? -1);

      const { stdout, stderr } = this.parseDockerLogs(output);

      this.logger.debug(`Container ${imageName} exited with code ${exitCode}`);

      return {
        stdout,
        stderr: timedOut
          ? `${stderr}\n[TIMEOUT] Execution exceeded ${timeoutMs}ms`.trim()
          : stderr,
        exitCode,
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      await container.remove().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn(`Failed to remove container: ${message}`);
      });
    }
  }

  private parseDockerLogs(output: string): { stdout: string; stderr: string } {
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.length === 0) continue;

      const streamType = line.charCodeAt(0);
      const content = line.slice(8).trim();

      if (content.length === 0) continue;

      if (streamType === 1) {
        stdoutLines.push(content);
      } else if (streamType === 2) {
        stderrLines.push(content);
      } else {
        stdoutLines.push(content);
      }
    }

    return {
      stdout: stdoutLines.join('\n'),
      stderr: stderrLines.join('\n'),
    };
  }

  private parseDockerLogLine(line: string): string | null {
    if (line.length === 0) return null;
    const content = line.slice(8).trim();
    return content.length > 0 ? content : null;
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
    onLog?: (message: string) => void,
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
              onLog?.(message);
            }
          }
          if (event.error) {
            buildLog.push(`ERROR: ${event.error}`);
            this.logger.error(`[${imageName}] ${event.error}`);
            onLog?.(`ERROR: ${event.error}`);
          }
          if (event.status) {
            this.logger.debug(`[${imageName}] ${event.status}`);
          }
        },
      );
    });
  }
}
