import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisLogService } from '../../../../common/redis/redis-log.service';
import { RetryableJobError } from '../../errors/retryable-job.error';
import type {
  CompilationContext,
  TeamLock,
  TeamLockHeartbeat,
} from '../../types/compile-queue-consumer.types';

const DEFAULT_TEAM_LOCK_TTL_MS = 15 * 60 * 1000;
const DEFAULT_TEAM_LOCK_POLL_MS = 1000;
const DEFAULT_TEAM_LOCK_MAX_WAIT_MS = 60_000;

@Injectable()
export class CompileTeamLockService {
  private readonly logger = new Logger(CompileTeamLockService.name);
  private readonly teamLockTtlMs: number;
  private readonly teamLockPollMs: number;
  private readonly teamLockMaxWaitMs: number;

  constructor(
    private readonly redisLogService: RedisLogService,
    private readonly configService: ConfigService,
  ) {
    this.teamLockTtlMs = this.configService.get<number>(
      'COMPILE_TEAM_LOCK_TTL_MS',
      DEFAULT_TEAM_LOCK_TTL_MS,
    );
    this.teamLockPollMs = this.configService.get<number>(
      'COMPILE_TEAM_LOCK_POLL_MS',
      DEFAULT_TEAM_LOCK_POLL_MS,
    );
    this.teamLockMaxWaitMs = this.configService.get<number>(
      'COMPILE_TEAM_LOCK_MAX_WAIT_MS',
      DEFAULT_TEAM_LOCK_MAX_WAIT_MS,
    );
  }

  async acquire(
    context: CompilationContext,
  ): Promise<{ lock: TeamLock; heartbeat: TeamLockHeartbeat }> {
    const lock = await this.waitForTeamLock(context);
    const heartbeat = this.startTeamLockHeartbeat(context, lock);
    return { lock, heartbeat };
  }

  async release(context: CompilationContext, lock: TeamLock): Promise<void> {
    const released = await this.redisLogService.releaseLock(
      lock.key,
      lock.value,
    );

    if (!released) {
      this.logger.warn(
        `Compile team lock for team ${context.teamId} was already released before job ${context.jobId} finished`,
      );
      return;
    }

    this.logger.debug(
      `Compile team lock released for team ${context.teamId} by job ${context.jobId}`,
    );
  }

  private async waitForTeamLock(
    context: CompilationContext,
  ): Promise<TeamLock> {
    const key = this.teamLockKey(context.teamId);
    const startTime = Date.now();
    const value = `${context.jobId}:${startTime}`;
    let waitingLogged = false;

    while (true) {
      const acquired = await this.redisLogService.acquireLock(
        key,
        value,
        this.teamLockTtlMs,
      );

      if (acquired) {
        this.logger.debug(
          `Compile team lock acquired for team ${context.teamId} by job ${context.jobId}`,
        );
        return { key, value };
      }

      if (!waitingLogged) {
        this.logger.debug(
          `Compile job ${context.jobId} waiting for team lock ${context.teamId}`,
        );
        waitingLogged = true;
      }

      const elapsedMs = Date.now() - startTime;
      if (elapsedMs >= this.teamLockMaxWaitMs) {
        const message = [
          `Timed out after ${elapsedMs}ms waiting for compile team lock`,
          `for team ${context.teamId}`,
          `while processing submission ${context.submissionId}`,
        ].join(' ');
        this.logger.warn(message);
        throw new RetryableJobError(message);
      }

      await this.sleep(this.teamLockPollMs);
    }
  }

  private startTeamLockHeartbeat(
    context: CompilationContext,
    lock: TeamLock,
  ): TeamLockHeartbeat {
    let active = true;
    let lockLossError: Error | null = null;

    const heartbeatPromise = (async () => {
      while (active) {
        await this.sleep(Math.max(1000, Math.floor(this.teamLockTtlMs / 3)));
        if (!active) {
          break;
        }

        const extended = await this.redisLogService.extendLock(
          lock.key,
          lock.value,
          this.teamLockTtlMs,
        );

        if (!extended) {
          lockLossError = new RetryableJobError(
            `Lost compile team lock for team ${context.teamId} while processing submission ${context.submissionId}`,
          );
          this.logger.error(lockLossError.message);
          active = false;
          break;
        }
      }
    })().catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown lock heartbeat error';
      lockLossError = new RetryableJobError(message);
      this.logger.error(message);
    });

    return {
      stop: () => {
        active = false;
        void heartbeatPromise.catch(() => undefined);
      },
      throwIfLockLost: () => {
        if (lockLossError) {
          throw lockLossError;
        }
      },
    };
  }

  private teamLockKey(teamId: string): string {
    return `lock:compile:team:${teamId}`;
  }

  private sleep(durationMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, durationMs));
  }
}
