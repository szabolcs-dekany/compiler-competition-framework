import { Injectable, Logger } from '@nestjs/common';
import type { Container } from 'dockerode';
import Docker from 'dockerode';
import { ConfigService } from '@nestjs/config';
import * as tar from 'tar-stream';
import { PassThrough, Readable } from 'stream';
import type {
  BuildImageParams,
  BuildImageResult,
  RunContainerParams,
  RunContainerResult,
} from './docker.types';

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
    const {
      imageName,
      command,
      mountPath,
      containerPath,
      scratchHostPath,
      scratchContainerPath = '/scratch',
      env,
      timeoutMs,
      stdin,
      memoryMb,
      cpuCount = 1,
      pidsLimit = 100,
      readOnlyMount = false,
    } = params;

    this.logger.debug(
      `Running container ${imageName} with command: ${command.join(' ')}`,
    );

    const container: Container = await this.docker.createContainer({
      Image: imageName,
      Cmd: command,
      WorkingDir: containerPath,
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: stdin !== undefined,
      OpenStdin: stdin !== undefined,
      StdinOnce: stdin !== undefined,
      Env: env ?? ['HOME=/tmp'],
      HostConfig: {
        Binds: [
          `${mountPath}:${containerPath}${readOnlyMount ? ':ro' : ''}`,
          ...(scratchHostPath
            ? [`${scratchHostPath}:${scratchContainerPath}`]
            : []),
        ],
        NetworkMode: 'none',
        ReadonlyRootfs: true,
        PidsLimit: pidsLimit,
        NanoCpus: Math.max(1, cpuCount) * 1_000_000_000,
        ...(typeof memoryMb === 'number'
          ? {
              Memory: memoryMb * 1024 * 1024,
              MemorySwap: memoryMb * 1024 * 1024,
            }
          : {}),
        SecurityOpt: ['no-new-privileges'],
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=10485760',
        },
      },
    });

    let timeoutId: NodeJS.Timeout | undefined;
    let timedOut = false;

    try {
      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
        stdin: stdin !== undefined,
      });

      await container.start();

      if (stdin !== undefined) {
        stream.write(stdin ?? '');
        stream.end();
      }

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

      const stdoutStream = new PassThrough();
      const stderrStream = new PassThrough();

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      let stdoutRemainder = '';
      let stderrRemainder = '';

      const flushLines = (
        chunk: Buffer,
        chunks: string[],
        remainder: string,
        onLine: (line: string) => void,
      ): string => {
        const text = remainder + chunk.toString('utf-8');
        const lines = text.split('\n');
        const newRemainder = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            chunks.push(trimmed);
            onLine(trimmed);
          }
        }
        return newRemainder;
      };

      this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

      await new Promise<void>((resolve, reject) => {
        stdoutStream.on('data', (chunk: Buffer) => {
          stdoutRemainder = flushLines(
            chunk,
            stdoutChunks,
            stdoutRemainder,
            (line) => {
              params.onLog?.(line);
            },
          );
        });
        stderrStream.on('data', (chunk: Buffer) => {
          stderrRemainder = flushLines(
            chunk,
            stderrChunks,
            stderrRemainder,
            (line) => {
              params.onLog?.(line);
            },
          );
        });
        stream.on('end', () => {
          stdoutStream.end();
          stderrStream.end();
          if (stdoutRemainder.trim()) {
            stdoutChunks.push(stdoutRemainder.trim());
            params.onLog?.(stdoutRemainder.trim());
          }
          if (stderrRemainder.trim()) {
            stderrChunks.push(stderrRemainder.trim());
            params.onLog?.(stderrRemainder.trim());
          }
          resolve();
        });
        stream.on('error', (err: unknown) => {
          stdoutStream.end();
          stderrStream.end();
          reject(err instanceof Error ? err : new Error(String(err)));
        });
      });

      const result = (await container.wait()) as { StatusCode?: number };
      const exitCode = timedOut ? -1 : (result.StatusCode ?? -1);

      const stdout = stdoutChunks.join('\n');
      const stderr = stderrChunks.join('\n');

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
