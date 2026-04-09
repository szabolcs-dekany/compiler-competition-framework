import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const LOG_BUFFER_PREFIX = 'log-buffer:';
const LOG_CHANNEL_PREFIX = 'log-channel:';

interface LogEvent {
  type: string;
  message?: string;
  status?: string;
}

@Injectable()
export class RedisLogService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLogService.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly subscriptionCounts = new Map<string, number>();

  constructor(private readonly configService: ConfigService) {
    const host: string = this.configService.get('REDIS_HOST', 'localhost');
    const port: number = this.configService.get('REDIS_PORT', 6379);

    this.publisher = new Redis({ host, port });
    this.subscriber = new Redis({ host, port });

    this.publisher.on('error', (err) =>
      this.logger.error(`Publisher error: ${err.message}`),
    );
    this.subscriber.on('error', (err) =>
      this.logger.error(`Subscriber error: ${err.message}`),
    );
  }

  private bufferKey(channel: string): string {
    return `${LOG_BUFFER_PREFIX}${channel}`;
  }

  private channelKey(channel: string): string {
    return `${LOG_CHANNEL_PREFIX}${channel}`;
  }

  async appendLog(channel: string, message: string): Promise<void> {
    const event = JSON.stringify({ type: 'log', message });
    await Promise.all([
      this.publisher.rpush(this.bufferKey(channel), message),
      this.publisher.publish(this.channelKey(channel), event),
    ]);
  }

  async publishEvent(
    channel: string,
    event: { type: string; message?: string; status?: string },
  ): Promise<void> {
    await this.publisher.publish(
      this.channelKey(channel),
      JSON.stringify(event),
    );
  }

  async getLogHistory(channel: string): Promise<string[]> {
    return this.publisher.lrange(this.bufferKey(channel), 0, -1);
  }

  async deleteBuffer(channel: string): Promise<void> {
    await this.publisher.del(this.bufferKey(channel));
  }

  async subscribe(
    channel: string,
    handler: (event: {
      type: string;
      message?: string;
      status?: string;
    }) => void,
  ): Promise<() => Promise<void>> {
    const ch = this.channelKey(channel);

    const current = this.subscriptionCounts.get(ch) ?? 0;
    if (current === 0) {
      await this.subscriber.subscribe(ch);
    }
    this.subscriptionCounts.set(ch, current + 1);

    const messageHandler = (received: string, raw: string) => {
      if (received !== ch) return;
      try {
        handler(JSON.parse(raw) as LogEvent);
      } catch {
        this.logger.warn(`Failed to parse log event on ${ch}`);
      }
    };

    this.subscriber.on('message', messageHandler);

    return async () => {
      this.subscriber.off('message', messageHandler);
      const remaining = (this.subscriptionCounts.get(ch) ?? 1) - 1;
      if (remaining <= 0) {
        this.subscriptionCounts.delete(ch);
        await this.subscriber.unsubscribe(ch).catch(() => {});
      } else {
        this.subscriptionCounts.set(ch, remaining);
      }
    };
  }

  onModuleDestroy(): void {
    this.publisher.disconnect();
    this.subscriber.disconnect();
  }
}
