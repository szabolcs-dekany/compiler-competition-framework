import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const LOG_STREAM_PREFIX = 'log-stream:';
const STREAM_BLOCK_TIMEOUT_MS = 5000;

interface LogEvent {
  type: string;
  message?: string;
  status?: string;
  [key: string]: unknown;
}

interface StreamEventShape {
  type: string;
}

type RedisStreamEntry = [id: string, fields: string[]];

@Injectable()
export class RedisLogService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLogService.name);
  private readonly redisHost: string;
  private readonly redisPort: number;
  private readonly publisher: Redis;
  private readonly activeReaders = new Set<Redis>();

  constructor(private readonly configService: ConfigService) {
    this.redisHost = this.configService.get('REDIS_HOST', 'localhost');
    this.redisPort = this.configService.get('REDIS_PORT', 6379);

    this.publisher = new Redis({
      host: this.redisHost,
      port: this.redisPort,
    });

    this.publisher.on('error', (err) =>
      this.logger.error(`Publisher error: ${err.message}`),
    );
  }

  private streamKey(channel: string): string {
    return `${LOG_STREAM_PREFIX}${channel}`;
  }

  private createReader(channel: string): Redis {
    const reader = new Redis({
      host: this.redisHost,
      port: this.redisPort,
    });

    reader.on('error', (err) =>
      this.logger.error(`Stream reader error for ${channel}: ${err.message}`),
    );

    this.activeReaders.add(reader);

    return reader;
  }

  private disconnectReader(reader: Redis): void {
    this.activeReaders.delete(reader);
    reader.disconnect();
  }

  private parseStreamEvent(
    channel: string,
    entryId: string,
    fields: string[],
  ): LogEvent | null {
    let payload: string | null = null;
    const event: LogEvent = { type: '' };

    for (let index = 0; index < fields.length - 1; index += 2) {
      const key = fields[index];
      const value = fields[index + 1];

      if (key === 'payload') {
        payload = value;
        continue;
      }

      if (key === 'type') {
        event.type = value;
      }

      if (key === 'message') {
        event.message = value;
      }

      if (key === 'status') {
        event.status = value;
      }
    }

    if (payload !== null) {
      try {
        const parsed: unknown = JSON.parse(payload);

        if (this.isLogEvent(parsed)) {
          return parsed;
        }

        this.logger.warn(
          `Malformed structured log stream event on ${channel} at ${entryId}`,
        );
        return null;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown parse error';
        this.logger.warn(
          `Failed to parse structured log stream event on ${channel} at ${entryId}: ${message}`,
        );
        return null;
      }
    }

    if (!event.type) {
      this.logger.warn(
        `Malformed log stream event on ${channel} at ${entryId}`,
      );
      return null;
    }

    return event;
  }

  private isLogEvent(value: unknown): value is LogEvent {
    const candidate = value as { type?: unknown };

    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      typeof candidate.type === 'string'
    );
  }

  private async appendEvent(channel: string, event: LogEvent): Promise<void> {
    await this.publisher.xadd(
      this.streamKey(channel),
      '*',
      'payload',
      JSON.stringify(event),
    );
  }

  private async readStream(channel: string): Promise<LogEvent[]> {
    const entries = await this.publisher.xrange(
      this.streamKey(channel),
      '-',
      '+',
    );

    return entries.flatMap(([entryId, fields]: RedisStreamEntry) => {
      const event = this.parseStreamEvent(channel, entryId, fields);
      return event ? [event] : [];
    });
  }

  async appendLog(channel: string, message: string): Promise<void> {
    await this.appendEvent(channel, { type: 'log', message });
  }

  async publishEvent<TEvent extends StreamEventShape>(
    channel: string,
    event: TEvent,
  ): Promise<void> {
    await this.appendEvent(channel, event as unknown as LogEvent);
  }

  async getLogHistory(channel: string): Promise<string[]> {
    const events = await this.readStream(channel);

    return events.flatMap((event) =>
      event.type === 'log' && typeof event.message === 'string'
        ? [event.message]
        : [],
    );
  }

  subscribeWithReplay<TEvent extends StreamEventShape>(
    channel: string,
    handler: (event: TEvent) => void,
    fromId = '0',
  ): Promise<() => Promise<void>> {
    const reader = this.createReader(channel);
    const key = this.streamKey(channel);
    let active = true;
    let lastId = fromId;

    const readLoop = (async () => {
      try {
        while (active) {
          const response = await reader.xread(
            'BLOCK',
            STREAM_BLOCK_TIMEOUT_MS,
            'STREAMS',
            key,
            lastId,
          );

          if (!active || !response || response.length === 0) {
            continue;
          }

          const [, entries] = response[0];

          for (const [entryId, fields] of entries) {
            lastId = entryId;

            const event = this.parseStreamEvent(channel, entryId, fields);
            if (!event) {
              continue;
            }

            handler(event as unknown as TEvent);

            if (!active) {
              break;
            }
          }
        }
      } catch (error: unknown) {
        if (!active) {
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Unknown stream read error';
        this.logger.error(`Failed to read log stream ${channel}: ${message}`);
        throw error;
      } finally {
        this.disconnectReader(reader);
      }
    })();

    return Promise.resolve(async () => {
      active = false;
      this.disconnectReader(reader);
      await readLoop;
    });
  }

  onModuleDestroy(): void {
    this.publisher.disconnect();

    for (const reader of this.activeReaders) {
      reader.disconnect();
    }

    this.activeReaders.clear();
  }
}
