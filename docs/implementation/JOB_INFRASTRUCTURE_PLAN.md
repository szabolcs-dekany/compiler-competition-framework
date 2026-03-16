# Job Infrastructure Implementation Plan

**Version 1.0 | Comprehensive Setup Guide**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Prerequisites & Dependencies](#3-prerequisites--dependencies)
4. [Directory Structure](#4-directory-structure)
5. [Configuration](#5-configuration)
6. [Implementation Details](#6-implementation-details)
7. [Worker Flow](#7-worker-flow)
8. [WebSocket Events](#8-websocket-events)
9. [Security Considerations](#9-security-considerations)
10. [Testing Strategy](#10-testing-strategy)
11. [Implementation Checklist](#11-implementation-checklist)

---

## 1. Executive Summary

This document provides a comprehensive implementation plan for the job infrastructure that powers the evaluation pipeline. The system uses BullMQ for job queuing, integrated NestJS workers for processing, Docker/Podman for container execution, and WebSockets for real-time updates.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Worker Integration** | Integrated with API server | Simpler deployment, shared resources |
| **Real-time Updates** | WebSocket via Socket.IO | Immediate feedback to users |
| **Image Storage** | Local only (no registry) | Simplicity, no external dependencies |
| **Error Handling** | Fail immediately, no auto-retry | Clear error states, manual intervention |
| **Container Runtime** | Docker/Podman standard runtime | Compatibility, no special setup needed |
| **Fallback Dockerfile** | Ubuntu 22.04 + build-essential | Common baseline for most compilers |

---

## 2. Architecture Overview

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NESTJS API SERVER                             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      HTTP CONTROLLERS                             │  │
│  │  TeamsController │ SubmissionsController │ TestCasesController   │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
│                                 │                                       │
│  ┌──────────────────────────────▼───────────────────────────────────┐  │
│  │                       SERVICES LAYER                              │  │
│  │  TeamsService │ SubmissionsService │ TestCasesService            │  │
│  │                      │ QueueService                               │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
│                                 │                                       │
│  ┌──────────────────────────────▼───────────────────────────────────┐  │
│  │                     BULLMQ INTEGRATION                            │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │  │
│  │  │   build    │──▶│  evaluate  │──▶│  cleanup   │                 │  │
│  │  │   queue    │  │   queue    │  │   queue    │                 │  │
│  │  └────────────┘  └────────────┘  └────────────┘                 │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
│                                 │                                       │
│  ┌──────────────────────────────▼───────────────────────────────────┐  │
│  │                     WORKER PROCESSORS                             │  │
│  │  BuildWorker │ EvaluateWorker │ CleanupWorker                    │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
│                                 │                                       │
│  ┌──────────────────────────────▼───────────────────────────────────┐  │
│  │                    WEBSOCKET GATEWAY                              │  │
│  │  /submissions namespace                                           │  │
│  │  Events: submission:status, testrun:start, testrun:complete      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │   Redis     │  │ PostgreSQL  │  │   Garage    │  │  Docker/    │   │
│  │  (BullMQ)   │  │  (Prisma)   │  │    (S3)     │  │  Podman     │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Queue Configuration

| Queue | Purpose | Priority | Concurrency | Retry |
|-------|---------|----------|-------------|-------|
| `build` | Build Docker images | High | 2 | No |
| `evaluate` | Execute test cases | Normal | 4 | No |
| `cleanup` | Remove images/containers | Low | 1 | No |

### 2.3 Data Flow

```
Team Uploads Submission
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  1. POST /api/submissions                                   │
│     - Upload compiler archive + source files                │
│     - Create Submission record (status: PENDING)            │
│     - Store files in S3                                     │
│     - Dispatch BUILD job                                    │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  2. BUILD WORKER                                            │
│     - Download compiler archive + Dockerfile from S3        │
│     - Use fallback Dockerfile if none provided              │
│     - Build Docker image: team-compiler-{submissionId}      │
│     - Create TestRun records for all test cases             │
│     - Dispatch EVALUATE jobs (one per test case)            │
│     - Update status: BUILDING → READY                       │
│     - Emit WebSocket: submission:status                     │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  3. EVALUATE WORKER (parallel, one per test case)           │
│     - Download source file from S3                          │
│     - Create container with security constraints            │
│     - Inject run_test.sh entrypoint                         │
│     - Execute with timeout                                  │
│     - Capture stdout/stderr/exit code                       │
│     - Calculate score + bonus                               │
│     - Update TestRun record                                 │
│     - Emit WebSocket: testrun:start → testrun:complete      │
│     - Check if all tests complete → aggregate scores        │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  4. COMPLETION                                              │
│     - All TestRuns complete                                 │
│     - Calculate totalScore                                  │
│     - Update Submission status: COMPLETED                   │
│     - Emit WebSocket: submission:complete                   │
│     - Schedule CLEANUP job (deferred)                       │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  5. CLEANUP WORKER (deferred, low priority)                 │
│     - Remove Docker image                                   │
│     - Clean up temp files                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Prerequisites & Dependencies

### 3.1 NPM Packages to Install

```bash
cd evaluator-api

# Docker SDK
npm install dockerode
npm install -D @types/dockerode

# WebSocket support
npm install @nestjs/platform-socket.io socket.io
npm install -D @types/socket.io
```

### 3.2 Already Installed (Verified)

| Package | Version | Purpose |
|---------|---------|---------|
| `@nestjs/bullmq` | ^11.0.4 | NestJS BullMQ integration |
| `bullmq` | ^5.71.0 | Job queue library |
| `@aws-sdk/client-s3` | ^3.1009.0 | S3 storage (already used) |
| `ioredis` | (via bullmq) | Redis client |

### 3.3 Infrastructure Requirements

| Service | Status | Port |
|---------|--------|------|
| Redis | Configured in docker-compose.yml | 6379 |
| PostgreSQL | Configured in docker-compose.yml | 5432 |
| Garage (S3) | Configured in docker-compose.yml | 9000 |
| Docker/Podman | Must be installed on host | /var/run/docker.sock |

### 3.4 Host Requirements

- Docker or Podman installed and running
- Socket accessible at `/var/run/docker.sock` (or `unix:///run/podman/podman.sock`)
- Sufficient disk space for Docker images (~500MB per submission)
- Sufficient memory for concurrent containers (256MB × concurrency)

---

## 4. Directory Structure

### 4.1 New Files to Create

```
evaluator-api/
├── src/
│   ├── modules/
│   │   └── job/
│   │       ├── jobs.module.ts              # BullMQ module configuration
│   │       ├── dto/
│   │       │   └── job-data.dto.ts         # Job data interfaces
│   │       ├── queues/
│   │       │   ├── index.ts                # Re-export all queues
│   │       │   ├── build.queue.ts          # Build queue definition
│   │       │   ├── evaluate.queue.ts       # Evaluate queue definition
│   │       │   └── cleanup.queue.ts        # Cleanup queue definition
│   │       ├── workers/
│   │       │   ├── index.ts                # Worker lifecycle management
│   │       │   ├── build.worker.ts         # Docker image builder
│   │       │   ├── evaluate.worker.ts      # Test case evaluator
│   │       │   └── cleanup.worker.ts       # Resource cleanup
│   │       └── services/
│   │           ├── docker.service.ts       # Docker/Podman operations
│   │           ├── evaluator.service.ts    # Container execution logic
│   │           ├── scoring.service.ts      # Score calculation
│   │           └── queue.service.ts        # Job dispatching
│   └── common/
│       ├── docker/
│       │   ├── fallback/
│       │   │   └── Dockerfile              # Default build environment
│       │   └── scripts/
│       │       └── run_test.sh             # Injected entrypoint
│       └── websocket/
│           ├── websocket.module.ts         # WebSocket module
│           └── submissions.gateway.ts      # Real-time event emitter
├── docker/
│   ├── fallback/
│   │   └── Dockerfile                      # (alternative location)
│   └── scripts/
│       └── run_test.sh                     # (alternative location)
```

### 4.2 Files to Modify

| File | Changes |
|------|---------|
| `src/app.module.ts` | Import JobsModule, WebSocketModule |
| `src/modules/submissions/submissions.module.ts` | Import JobsModule |
| `src/modules/submissions/submissions.service.ts` | Inject QueueService, dispatch build job |
| `evaluator-api/.env.example` | Add worker configuration variables |

### 4.3 Recommended File Locations

**Fallback Dockerfile**: `evaluator-api/src/common/docker/fallback/Dockerfile`
- Kept inside `src/` for easy access via `__dirname` or `process.cwd()`
- Bundled with compiled output in `dist/`

**Injected Scripts**: `evaluator-api/src/common/docker/scripts/run_test.sh`
- Same rationale as above

---

## 5. Configuration

### 5.1 Environment Variables

Add to `.env` and `.env.example`:

```env
# === WORKER CONFIGURATION ===
# Build worker concurrency (how many images to build simultaneously)
WORKER_CONCURRENCY_BUILD=2

# Evaluate worker concurrency (how many tests to run simultaneously)
WORKER_CONCURRENCY_EVALUATE=4

# Cleanup worker concurrency
WORKER_CONCURRENCY_CLEANUP=1

# === DOCKER/PODMAN CONFIGURATION ===
# Docker socket path (default: Docker)
DOCKER_SOCKET_PATH=/var/run/docker.sock

# For Podman, use:
# DOCKER_SOCKET_PATH=unix:///run/podman/podman.sock

# Default timeout for test execution (ms)
DOCKER_DEFAULT_TIMEOUT_MS=30000

# Default memory limit (MB)
DOCKER_DEFAULT_MEMORY_MB=256

# === JOB QUEUE CONFIGURATION ===
# Remove completed jobs after this many
QUEUE_REMOVE_ON_COMPLETE=100

# Remove failed jobs after this many
QUEUE_REMOVE_ON_FAIL=500
```

### 5.2 Configuration Service

Create typed configuration interface:

```typescript
// src/config/worker.config.ts
export interface WorkerConfig {
  build: {
    concurrency: number;
  };
  evaluate: {
    concurrency: number;
  };
  cleanup: {
    concurrency: number;
  };
  docker: {
    socketPath: string;
    defaultTimeoutMs: number;
    defaultMemoryMb: number;
  };
  queue: {
    removeOnComplete: number;
    removeOnFail: number;
  };
}

export function getWorkerConfig(configService: ConfigService): WorkerConfig {
  return {
    build: {
      concurrency: configService.get('WORKER_CONCURRENCY_BUILD', 2),
    },
    evaluate: {
      concurrency: configService.get('WORKER_CONCURRENCY_EVALUATE', 4),
    },
    cleanup: {
      concurrency: configService.get('WORKER_CONCURRENCY_CLEANUP', 1),
    },
    docker: {
      socketPath: configService.get('DOCKER_SOCKET_PATH', '/var/run/docker.sock'),
      defaultTimeoutMs: configService.get('DOCKER_DEFAULT_TIMEOUT_MS', 30000),
      defaultMemoryMb: configService.get('DOCKER_DEFAULT_MEMORY_MB', 256),
    },
    queue: {
      removeOnComplete: configService.get('QUEUE_REMOVE_ON_COMPLETE', 100),
      removeOnFail: configService.get('QUEUE_REMOVE_ON_FAIL', 500),
    },
  };
}
```

---

## 6. Implementation Details

### 6.1 Job Data Types

```typescript
// src/modules/job/dto/job-data.dto.ts

export interface BuildJobData {
  submissionId: string;
  teamId: string;
  teamName: string;
  compilerS3Key: string;
  dockerfileS3Key: string | null;
}

export interface EvaluateJobData {
  submissionId: string;
  teamId: string;
  testCaseId: string;
  sourceFileS3Key: string;
  imageId: string;
}

export interface CleanupJobData {
  submissionId: string;
  imageId: string;
  delayMs?: number;
}

export interface BuildJobResult {
  success: boolean;
  imageId: string;
  testRunCount: number;
  error?: string;
}

export interface EvaluateJobResult {
  success: boolean;
  pointsEarned: number;
  bonusEarned: number;
  status: TestRunStatus;
  error?: string;
}
```

### 6.2 Queue Definitions

```typescript
// src/modules/job/queues/build.queue.ts
import { Queue } from 'bullmq';
import type { BuildJobData } from '../dto/job-data.dto';

export const BUILD_QUEUE = 'build';

export function createBuildQueue(connection: { host: string; port: number }) {
  return new Queue<BuildJobData>(BUILD_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });
}

// src/modules/job/queues/evaluate.queue.ts
import { Queue } from 'bullmq';
import type { EvaluateJobData } from '../dto/job-data.dto';

export const EVALUATE_QUEUE = 'evaluate';

export function createEvaluateQueue(connection: { host: string; port: number }) {
  return new Queue<EvaluateJobData>(EVALUATE_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });
}

// src/modules/job/queues/cleanup.queue.ts
import { Queue } from 'bullmq';
import type { CleanupJobData } from '../dto/job-data.dto';

export const CLEANUP_QUEUE = 'cleanup';

export function createCleanupQueue(connection: { host: string; port: number }) {
  return new Queue<CleanupJobData>(CLEANUP_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 50,
      removeOnFail: 200,
      delay: 3600000,
    },
  });
}
```

### 6.3 Docker Service

```typescript
// src/modules/job/services/docker.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Docker from 'dockerode';
import * as fs from 'fs';
import * as path from 'path';
import * as tar from 'tar';

@Injectable()
export class DockerService {
  private readonly logger = new Logger(DockerService.name);
  private readonly docker: Docker;

  constructor(private readonly config: ConfigService) {
    const socketPath = this.config.get('DOCKER_SOCKET_PATH', '/var/run/docker.sock');
    this.docker = new Docker({ socketPath });
    this.verifyConnection();
  }

  private async verifyConnection() {
    try {
      await this.docker.ping();
      this.logger.log('Docker connection established');
    } catch (error) {
      this.logger.error('Failed to connect to Docker daemon', error);
    }
  }

  async buildImage(params: {
    buildDir: string;
    imageId: string;
    onProgress?: (event: Docker.BuildProgressEvent) => void;
  }): Promise<string> {
    const { buildDir, imageId, onProgress } = params;

    return new Promise((resolve, reject) => {
      this.docker.buildImage(
        { context: buildDir, src: ['.'] },
        { t: imageId },
        (err, stream) => {
          if (err) return reject(err);

          this.docker.modem.followProgress(
            stream,
            (err, output) => {
              if (err) reject(err);
              else resolve(imageId);
            },
            (event) => {
              if (onProgress) onProgress(event);
              if (event.stream) {
                this.logger.debug(`[${imageId}] ${event.stream.trim()}`);
              }
            },
          );
        },
      );
    });
  }

  async createContainer(params: {
    imageId: string;
    sourceFilePath: string;
    scriptsDir: string;
    timeoutMs: number;
    maxMemoryMb: number;
    args: string[];
    stdin?: string;
  }): Promise<Docker.Container> {
    const { imageId, sourceFilePath, scriptsDir, timeoutMs, maxMemoryMb, args, stdin } = params;

    const timeoutSeconds = Math.ceil(timeoutMs / 1000);

    const container = await this.docker.createContainer({
      Image: imageId,
      Entrypoint: ['/scripts/run_test.sh'],
      Cmd: ['/workspace/source.lang', String(timeoutSeconds), ...args],
      HostConfig: {
        NetworkMode: 'none',
        Memory: maxMemoryMb * 1024 * 1024,
        MemorySwap: maxMemoryMb * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: 100000,
        PidsLimit: 100,
        SecurityOpt: ['no-new-privileges'],
        CapDrop: ['ALL'],
        ReadonlyRootfs: true,
        Tmpfs: { '/tmp': 'size=10m,mode=1777' },
        Binds: [
          `${sourceFilePath}:/workspace/source.lang:ro`,
          `${scriptsDir}:/scripts:ro`,
        ],
      },
      User: 'nobody:nogroup',
    });

    return container;
  }

  async runContainer(params: {
    imageId: string;
    sourceFilePath: string;
    scriptsDir: string;
    timeoutMs: number;
    maxMemoryMb: number;
    args: string[];
    stdin?: string;
  }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
  }> {
    const container = await this.createContainer(params);
    const startTime = Date.now();

    try {
      await container.start();

      const result = await this.waitForContainer(container, params.timeoutMs + 5000);
      const runTimeMs = Date.now() - startTime;

      return {
        ...result,
        runTimeMs,
      };
    } finally {
      await container.remove({ force: true }).catch(() => {});
    }
  }

  private async waitForContainer(
    container: Docker.Container,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(async () => {
        await container.kill().catch(() => {});
        resolve({
          stdout: '',
          stderr: 'Execution timed out',
          exitCode: 137,
          timedOut: true,
        });
      }, timeoutMs);

      container.wait(async (err, data) => {
        clearTimeout(timeout);

        if (err) {
          resolve({
            stdout: '',
            stderr: err.message,
            exitCode: -1,
            timedOut: false,
          });
          return;
        }

        const logs = await container.logs({
          stdout: true,
          stderr: true,
        });

        const { stdout, stderr } = this.parseDockerLogs(logs);
        const exitCode = data?.StatusCode ?? -1;

        resolve({
          stdout,
          stderr,
          exitCode,
          timedOut: false,
        });
      });
    });
  }

  private parseDockerLogs(logs: Buffer): { stdout: string; stderr: string } {
    const str = logs.toString('utf-8');
    const stdout: string[] = [];
    const stderr: string[] = [];

    let i = 0;
    while (i < str.length) {
      if (i + 8 > str.length) break;

      const header = str.slice(i, i + 8);
      const streamType = header.charCodeAt(0);
      const length = header.readUInt32BE(4);

      i += 8;

      if (i + length > str.length) break;

      const content = str.slice(i, i + length);
      i += length;

      if (streamType === 1) {
        stdout.push(content);
      } else if (streamType === 2) {
        stderr.push(content);
      }
    }

    return {
      stdout: stdout.join(''),
      stderr: stderr.join(''),
    };
  }

  async removeImage(imageId: string): Promise<void> {
    try {
      const image = this.docker.getImage(imageId);
      await image.remove({ force: true });
      this.logger.debug(`Removed image: ${imageId}`);
    } catch (error) {
      this.logger.warn(`Failed to remove image ${imageId}:`, error);
    }
  }

  async imageExists(imageId: string): Promise<boolean> {
    try {
      await this.docker.getImage(imageId).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async extractArchive(archivePath: string, destDir: string): Promise<void> {
    await fs.promises.mkdir(destDir, { recursive: true });
    await tar.x({
      file: archivePath,
      cwd: destDir,
      strip: 1,
    });
  }
}
```

### 6.4 Scoring Service

```typescript
// src/modules/job/services/scoring.service.ts
import { Injectable } from '@nestjs/common';
import { TestRunStatus } from '@evaluator/shared';

@Injectable()
export class ScoringService {
  calculate(params: {
    actualStdout: string;
    expectedStdout: string;
    actualExitCode: number;
    expectedExitCode: number;
    runTimeMs: number;
    points: number;
    performanceBonus: boolean;
    perfThresholdMs: number | null;
    timedOut: boolean;
  }): {
    pointsEarned: number;
    bonusEarned: number;
    status: TestRunStatus;
  } {
    if (params.timedOut) {
      return {
        pointsEarned: 0,
        bonusEarned: 0,
        status: TestRunStatus.TIMEOUT,
      };
    }

    const outputMatches = this.compareOutput(params.actualStdout, params.expectedStdout);
    const exitCodeMatches = params.actualExitCode === params.expectedExitCode;

    if (!outputMatches || !exitCodeMatches) {
      return {
        pointsEarned: 0,
        bonusEarned: 0,
        status: TestRunStatus.FAILED,
      };
    }

    const bonusEarned = this.calculateBonus(
      params.points,
      params.runTimeMs,
      params.perfThresholdMs,
      params.performanceBonus,
    );

    return {
      pointsEarned: params.points,
      bonusEarned,
      status: TestRunStatus.PASSED,
    };
  }

  private compareOutput(actual: string, expected: string): boolean {
    const normalizedActual = actual.replace(/\r\n/g, '\n').trim();
    const normalizedExpected = expected.replace(/\r\n/g, '\n').trim();
    return normalizedActual === normalizedExpected;
  }

  private calculateBonus(
    points: number,
    runTimeMs: number,
    thresholdMs: number | null,
    hasBonus: boolean,
  ): number {
    if (!hasBonus || thresholdMs === null) return 0;
    if (runTimeMs >= thresholdMs) return 0;
    return Math.floor(points * 0.2);
  }

  mapExitCodeToStatus(exitCode: number): TestRunStatus {
    switch (exitCode) {
      case 0:
        return TestRunStatus.PASSED;
      case 100:
        return TestRunStatus.FAILED;
      case 124:
        return TestRunStatus.TIMEOUT;
      case 137:
        return TestRunStatus.TIMEOUT;
      case 139:
        return TestRunStatus.ERROR;
      default:
        return TestRunStatus.FAILED;
    }
  }
}
```

### 6.5 Queue Service

```typescript
// src/modules/job/services/queue.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { BuildJobData, EvaluateJobData, CleanupJobData } from '../dto/job-data.dto';
import {
  BUILD_QUEUE,
  EVALUATE_QUEUE,
  CLEANUP_QUEUE,
} from '../queues';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly buildQueue: Queue<BuildJobData>;
  private readonly evaluateQueue: Queue<EvaluateJobData>;
  private readonly cleanupQueue: Queue<CleanupJobData>;

  constructor(private readonly config: ConfigService) {
    const connection = {
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get('REDIS_PORT', 6379),
    };

    this.buildQueue = new Queue<BuildJobData>(BUILD_QUEUE, { connection });
    this.evaluateQueue = new Queue<EvaluateJobData>(EVALUATE_QUEUE, { connection });
    this.cleanupQueue = new Queue<CleanupJobData>(CLEANUP_QUEUE, { connection });
  }

  async dispatchBuildJob(data: BuildJobData): Promise<string> {
    const job = await this.buildQueue.add('build', data, {
      jobId: `build-${data.submissionId}`,
    });
    this.logger.log(`Dispatched build job for submission ${data.submissionId}`);
    return job.id!;
  }

  async dispatchEvaluateJob(data: EvaluateJobData): Promise<string> {
    const job = await this.evaluateQueue.add('evaluate', data, {
      jobId: `eval-${data.submissionId}-${data.testCaseId}`,
    });
    this.logger.debug(`Dispatched evaluate job for ${data.testCaseId}`);
    return job.id!;
  }

  async dispatchEvaluateJobs(
    submissionId: string,
    teamId: string,
    imageId: string,
    testCases: Array<{ id: string; sourceFileS3Key: string }>,
  ): Promise<string[]> {
    const jobs = testCases.map((tc) =>
      this.evaluateQueue.add('evaluate', {
        submissionId,
        teamId,
        testCaseId: tc.id,
        sourceFileS3Key: tc.sourceFileS3Key,
        imageId,
      }),
    );

    const results = await Promise.all(jobs);
    this.logger.log(`Dispatched ${results.length} evaluate jobs for submission ${submissionId}`);
    return results.map((j) => j.id!);
  }

  async dispatchCleanupJob(data: CleanupJobData, delayMs?: number): Promise<string> {
    const job = await this.cleanupQueue.add('cleanup', data, {
      delay: delayMs ?? 3600000,
    });
    this.logger.debug(`Dispatched cleanup job for submission ${data.submissionId}`);
    return job.id!;
  }

  async getQueueStats(): Promise<{
    build: { waiting: number; active: number };
    evaluate: { waiting: number; active: number };
    cleanup: { waiting: number; active: number };
  }> {
    const [buildWaiting, buildActive] = await Promise.all([
      this.buildQueue.getWaitingCount(),
      this.buildQueue.getActiveCount(),
    ]);

    const [evalWaiting, evalActive] = await Promise.all([
      this.evaluateQueue.getWaitingCount(),
      this.evaluateQueue.getActiveCount(),
    ]);

    const [cleanupWaiting, cleanupActive] = await Promise.all([
      this.cleanupQueue.getWaitingCount(),
      this.cleanupQueue.getActiveCount(),
    ]);

    return {
      build: { waiting: buildWaiting, active: buildActive },
      evaluate: { waiting: evalWaiting, active: evalActive },
      cleanup: { waiting: cleanupWaiting, active: cleanupActive },
    };
  }

  async onModuleDestroy() {
    await Promise.all([
      this.buildQueue.close(),
      this.evaluateQueue.close(),
      this.cleanupQueue.close(),
    ]);
  }
}
```

### 6.6 WebSocket Gateway

```typescript
// src/common/websocket/submissions.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { TestRunWithDetailsDto } from '@evaluator/shared';

@WebSocketGateway({
  namespace: '/submissions',
  cors: {
    origin: '*',
  },
})
export class SubmissionsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SubmissionsGateway.name);
  private readonly submissionRooms: Map<string, Set<string>> = new Map();

  afterInit(server: Server) {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
    this.submissionRooms.forEach((clients, submissionId) => {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.submissionRooms.delete(submissionId);
      }
    });
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, submissionId: string) {
    client.join(`submission:${submissionId}`);
    
    if (!this.submissionRooms.has(submissionId)) {
      this.submissionRooms.set(submissionId, new Set());
    }
    this.submissionRooms.get(submissionId)!.add(client.id);
    
    this.logger.debug(`Client ${client.id} subscribed to submission ${submissionId}`);
    return { success: true };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, submissionId: string) {
    client.leave(`submission:${submissionId}`);
    
    const room = this.submissionRooms.get(submissionId);
    if (room) {
      room.delete(client.id);
      if (room.size === 0) {
        this.submissionRooms.delete(submissionId);
      }
    }
    
    this.logger.debug(`Client ${client.id} unsubscribed from submission ${submissionId}`);
    return { success: true };
  }

  emitSubmissionStatus(submissionId: string, status: string) {
    this.server.to(`submission:${submissionId}`).emit('submission:status', {
      submissionId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  emitTestRunStart(submissionId: string, testCaseId: string) {
    this.server.to(`submission:${submissionId}`).emit('testrun:start', {
      submissionId,
      testCaseId,
      timestamp: new Date().toISOString(),
    });
  }

  emitTestRunComplete(submissionId: string, testRun: TestRunWithDetailsDto) {
    this.server.to(`submission:${submissionId}`).emit('testrun:complete', testRun);
  }

  emitSubmissionComplete(submissionId: string, totalScore: number) {
    this.server.to(`submission:${submissionId}`).emit('submission:complete', {
      submissionId,
      totalScore,
      timestamp: new Date().toISOString(),
    });
  }
}
```

---

## 7. Worker Flow

### 7.1 Build Worker

```typescript
// src/modules/job/workers/build.worker.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BuildJobData, BuildJobResult } from '../dto/job-data.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { DockerService } from '../services/docker.service';
import { QueueService } from '../services/queue.service';
import { TestCasesService } from '../../test-cases/test-cases.service';
import { SubmissionsGateway } from '../../common/websocket/submissions.gateway';
import { SubmissionStatus, TestRunStatus } from '@evaluator/shared';

@Injectable()
export class BuildWorker implements OnModuleInit {
  private readonly logger = new Logger(BuildWorker.name);
  private worker: Worker<BuildJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly docker: DockerService,
    private readonly queueService: QueueService,
    private readonly testCases: TestCasesService,
    private readonly websocket: SubmissionsGateway,
  ) {}

  onModuleInit() {
    const concurrency = this.config.get('WORKER_CONCURRENCY_BUILD', 2);

    this.worker = new Worker<BuildJobData>(
      'build',
      async (job: Job<BuildJobData>) => this.processJob(job),
      {
        connection: {
          host: this.config.get('REDIS_HOST', 'localhost'),
          port: this.config.get('REDIS_PORT', 6379),
        },
        concurrency,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Build job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Build job ${job?.id} failed:`, err);
      this.handleBuildFailure(job?.data, err);
    });
  }

  private async processJob(job: Job<BuildJobData>): Promise<BuildJobResult> {
    const { submissionId, teamId, compilerS3Key, dockerfileS3Key } = job.data;

    this.logger.log(`Building image for submission ${submissionId}`);

    await this.updateSubmissionStatus(submissionId, SubmissionStatus.BUILDING);
    this.websocket.emitSubmissionStatus(submissionId, SubmissionStatus.BUILDING);
    job.updateProgress(5);

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'build-'));
    const buildDir = path.join(tempDir, 'build');
    await fs.promises.mkdir(buildDir);

    try {
      job.updateProgress(10);

      await this.downloadCompiler(compilerS3Key, buildDir);
      job.updateProgress(20);

      await this.prepareDockerfile(dockerfileS3Key, buildDir);
      job.updateProgress(30);

      const imageId = `team-compiler-${submissionId}`;
      await this.docker.buildImage({
        buildDir,
        imageId,
        onProgress: (event) => {
          if (event.progress) {
            job.updateProgress(30 + Math.floor(event.progress * 0.5));
          }
        },
      });
      job.updateProgress(80);

      const testCases = this.testCases.findAll();
      await this.createTestRuns(submissionId, testCases);
      job.updateProgress(90);

      const sourceFiles = await this.prisma.sourceFile.findMany({
        where: { teamId },
      });

      await this.queueService.dispatchEvaluateJobs(
        submissionId,
        teamId,
        imageId,
        sourceFiles.map((sf) => ({
          id: sf.testCaseId,
          sourceFileS3Key: sf.s3Key,
        })),
      );

      await this.updateSubmissionStatus(submissionId, SubmissionStatus.READY);
      this.websocket.emitSubmissionStatus(submissionId, SubmissionStatus.READY);
      job.updateProgress(100);

      return {
        success: true,
        imageId,
        testRunCount: testCases.length,
      };
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  private async downloadCompiler(s3Key: string, buildDir: string): Promise<void> {
    const archiveBuffer = await this.storage.getFile(s3Key);
    const archivePath = path.join(buildDir, 'compiler.tar.gz');
    await fs.promises.writeFile(archivePath, archiveBuffer);

    const { execSync } = require('child_process');
    execSync(`tar -xzf ${archivePath} -C ${buildDir}`, { stdio: 'inherit' });
    await fs.promises.unlink(archivePath);
  }

  private async prepareDockerfile(
    dockerfileS3Key: string | null,
    buildDir: string,
  ): Promise<void> {
    if (dockerfileS3Key) {
      const dockerfileBuffer = await this.storage.getFile(dockerfileS3Key);
      await fs.promises.writeFile(path.join(buildDir, 'Dockerfile'), dockerfileBuffer);
    } else {
      const fallbackPath = path.join(
        process.cwd(),
        'src/common/docker/fallback/Dockerfile',
      );
      await fs.promises.copyFile(fallbackPath, path.join(buildDir, 'Dockerfile'));
    }
  }

  private async createTestRuns(
    submissionId: string,
    testCases: Array<{ id: string }>,
  ): Promise<void> {
    await this.prisma.testRun.createMany({
      data: testCases.map((tc) => ({
        submissionId,
        testCaseId: tc.id,
        status: TestRunStatus.PENDING,
      })),
      skipDuplicates: true,
    });
  }

  private async updateSubmissionStatus(
    submissionId: string,
    status: SubmissionStatus,
  ): Promise<void> {
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: { status },
    });
  }

  private async handleBuildFailure(
    data: BuildJobData | undefined,
    error: Error,
  ): Promise<void> {
    if (!data) return;

    await this.prisma.submission.update({
      where: { id: data.submissionId },
      data: {
        status: SubmissionStatus.FAILED,
      },
    });

    this.websocket.emitSubmissionStatus(data.submissionId, SubmissionStatus.FAILED);
  }
}
```

### 7.2 Evaluate Worker

```typescript
// src/modules/job/workers/evaluate.worker.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { EvaluateJobData, EvaluateJobResult } from '../dto/job-data.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { DockerService } from '../services/docker.service';
import { ScoringService } from '../services/scoring.service';
import { QueueService } from '../services/queue.service';
import { TestCasesService } from '../../test-cases/test-cases.service';
import { SubmissionsGateway } from '../../common/websocket/submissions.gateway';
import { TestRunStatus, SubmissionStatus } from '@evaluator/shared';

@Injectable()
export class EvaluateWorker implements OnModuleInit {
  private readonly logger = new Logger(EvaluateWorker.name);
  private worker: Worker<EvaluateJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly docker: DockerService,
    private readonly scoring: ScoringService,
    private readonly queueService: QueueService,
    private readonly testCases: TestCasesService,
    private readonly websocket: SubmissionsGateway,
  ) {}

  onModuleInit() {
    const concurrency = this.config.get('WORKER_CONCURRENCY_EVALUATE', 4);

    this.worker = new Worker<EvaluateJobData>(
      'evaluate',
      async (job: Job<EvaluateJobData>) => this.processJob(job),
      {
        connection: {
          host: this.config.get('REDIS_HOST', 'localhost'),
          port: this.config.get('REDIS_PORT', 6379),
        },
        concurrency,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Evaluate job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Evaluate job ${job?.id} failed:`, err);
      this.handleEvaluationFailure(job?.data, err);
    });
  }

  private async processJob(job: Job<EvaluateJobData>): Promise<EvaluateJobResult> {
    const { submissionId, testCaseId, sourceFileS3Key, imageId } = job.data;

    this.logger.log(`Evaluating ${testCaseId} for submission ${submissionId}`);

    await this.updateTestRunStatus(submissionId, testCaseId, TestRunStatus.COMPILING);
    this.websocket.emitTestRunStart(submissionId, testCaseId);
    job.updateProgress(10);

    const testCase = this.testCases.getFullTestCase(testCaseId);
    if (!testCase) {
      throw new Error(`Test case ${testCaseId} not found`);
    }

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'eval-'));
    const sourcePath = path.join(tempDir, 'source.lang');

    try {
      const sourceBuffer = await this.storage.getFile(sourceFileS3Key);
      await fs.promises.writeFile(sourcePath, sourceBuffer);
      job.updateProgress(20);

      await this.updateTestRunStatus(submissionId, testCaseId, TestRunStatus.RUNNING);

      const scriptsDir = path.join(process.cwd(), 'src/common/docker/scripts');
      const result = await this.docker.runContainer({
        imageId,
        sourceFilePath: sourcePath,
        scriptsDir,
        timeoutMs: testCase.timeout_ms,
        maxMemoryMb: testCase.max_memory_mb,
        args: testCase.args ?? [],
      });
      job.updateProgress(80);

      const { pointsEarned, bonusEarned, status } = this.scoring.calculate({
        actualStdout: result.stdout,
        expectedStdout: testCase.expected_stdout,
        actualExitCode: result.exitCode,
        expectedExitCode: testCase.expected_exit_code,
        runTimeMs: 0,
        points: testCase.points,
        performanceBonus: testCase.performance_bonus,
        perfThresholdMs: testCase.performance_threshold_ms,
        timedOut: result.timedOut,
      });

      const testRun = await this.prisma.testRun.update({
        where: {
          submissionId_testCaseId: { submissionId, testCaseId },
        },
        data: {
          status,
          actualStdout: result.stdout,
          actualStderr: result.stderr,
          actualExitCode: result.exitCode,
          expectedStdout: testCase.expected_stdout,
          expectedExitCode: testCase.expected_exit_code,
          pointsEarned,
          bonusEarned,
          completedAt: new Date(),
        },
      });

      const testRunWithDetails = {
        ...testRun,
        status: testRun.status as TestRunStatus,
        testCase: {
          id: testCase.id,
          name: testCase.name,
          category: testCase.category,
          points: testCase.points,
        },
        createdAt: testRun.createdAt.toISOString(),
        completedAt: testRun.completedAt?.toISOString() ?? null,
      };

      this.websocket.emitTestRunComplete(submissionId, testRunWithDetails);
      job.updateProgress(90);

      await this.checkSubmissionCompletion(submissionId);
      job.updateProgress(100);

      return {
        success: true,
        pointsEarned,
        bonusEarned,
        status,
      };
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  private async updateTestRunStatus(
    submissionId: string,
    testCaseId: string,
    status: TestRunStatus,
  ): Promise<void> {
    await this.prisma.testRun.update({
      where: {
        submissionId_testCaseId: { submissionId, testCaseId },
      },
      data: { status },
    });
  }

  private async checkSubmissionCompletion(submissionId: string): Promise<void> {
    const testRuns = await this.prisma.testRun.findMany({
      where: { submissionId },
    });

    const allComplete = testRuns.every(
      (run) =>
        run.status !== TestRunStatus.PENDING &&
        run.status !== TestRunStatus.COMPILING &&
        run.status !== TestRunStatus.RUNNING,
    );

    if (!allComplete) return;

    const totalScore = testRuns.reduce(
      (sum, run) => sum + run.pointsEarned + run.bonusEarned,
      0,
    );

    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.COMPLETED,
        totalScore,
      },
    });

    this.websocket.emitSubmissionComplete(submissionId, totalScore);

    await this.queueService.dispatchCleanupJob({
      submissionId,
      imageId: `team-compiler-${submissionId}`,
    });
  }

  private async handleEvaluationFailure(
    data: EvaluateJobData | undefined,
    error: Error,
  ): Promise<void> {
    if (!data) return;

    await this.prisma.testRun.update({
      where: {
        submissionId_testCaseId: {
          submissionId: data.submissionId,
          testCaseId: data.testCaseId,
        },
      },
      data: {
        status: TestRunStatus.ERROR,
        errorMessage: error.message,
        completedAt: new Date(),
      },
    });

    await this.checkSubmissionCompletion(data.submissionId);
  }
}
```

### 7.3 Cleanup Worker

```typescript
// src/modules/job/workers/cleanup.worker.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { CleanupJobData } from '../dto/job-data.dto';
import { DockerService } from '../services/docker.service';

@Injectable()
export class CleanupWorker implements OnModuleInit {
  private readonly logger = new Logger(CleanupWorker.name);
  private worker: Worker<CleanupJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly docker: DockerService,
  ) {}

  onModuleInit() {
    const concurrency = this.config.get('WORKER_CONCURRENCY_CLEANUP', 1);

    this.worker = new Worker<CleanupJobData>(
      'cleanup',
      async (job: Job<CleanupJobData>) => this.processJob(job),
      {
        connection: {
          host: this.config.get('REDIS_HOST', 'localhost'),
          port: this.config.get('REDIS_PORT', 6379),
        },
        concurrency,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Cleanup job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Cleanup job ${job?.id} failed:`, err);
    });
  }

  private async processJob(job: Job<CleanupJobData>): Promise<void> {
    const { submissionId, imageId } = job.data;

    this.logger.log(`Cleaning up resources for submission ${submissionId}`);

    if (imageId) {
      await this.docker.removeImage(imageId);
    }

    this.logger.log(`Cleanup complete for submission ${submissionId}`);
  }
}
```

---

## 8. WebSocket Events

### 8.1 Event Types

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `subscribe` | Client → Server | `submissionId: string` | Subscribe to updates |
| `unsubscribe` | Client → Server | `submissionId: string` | Unsubscribe |
| `submission:status` | Server → Client | `{ submissionId, status, timestamp }` | Status changed |
| `testrun:start` | Server → Client | `{ submissionId, testCaseId, timestamp }` | Test started |
| `testrun:complete` | Server → Client | `TestRunWithDetailsDto` | Test completed |
| `submission:complete` | Server → Client | `{ submissionId, totalScore, timestamp }` | All tests done |

### 8.2 Client Usage Example

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/submissions');

socket.emit('subscribe', submissionId);

socket.on('submission:status', (data) => {
  console.log(`Status: ${data.status}`);
});

socket.on('testrun:start', (data) => {
  console.log(`Test ${data.testCaseId} started`);
});

socket.on('testrun:complete', (testRun) => {
  console.log(`Test ${testRun.testCaseId}: ${testRun.status}`);
  console.log(`Points: ${testRun.pointsEarned} + ${testRun.bonusEarned} bonus`);
});

socket.on('submission:complete', (data) => {
  console.log(`Total score: ${data.totalScore}`);
  socket.emit('unsubscribe', submissionId);
});
```

---

## 9. Security Considerations

### 9.1 Container Security Options

```typescript
const securityOptions = {
  NetworkMode: 'none',
  Memory: 256 * 1024 * 1024,
  MemorySwap: 256 * 1024 * 1024,
  CpuPeriod: 100000,
  CpuQuota: 100000,
  PidsLimit: 100,
  SecurityOpt: ['no-new-privileges'],
  CapDrop: ['ALL'],
  ReadonlyRootfs: true,
  Tmpfs: { '/tmp': 'size=10m,mode=1777' },
};
```

### 9.2 Exit Code Mapping

| Code | Status | Description |
|------|--------|-------------|
| 0 | PASSED | Successful execution |
| 100 | FAILED | Compilation failed |
| 124 | TIMEOUT | Compilation timeout |
| 137 | TIMEOUT | Execution timeout/OOM |
| 139 | ERROR | Segmentation fault |
| -1 | ERROR | Container error |

### 9.3 Resource Limits

| Resource | Limit | Rationale |
|----------|-------|-----------|
| CPU | 1 core | Fair allocation |
| Memory | 256 MB | Prevent memory exhaustion |
| PIDs | 100 | Prevent fork bombs |
| File descriptors | 64 | Prevent resource exhaustion |
| Network | None | No external access |
| Filesystem | Read-only | Prevent modification |

---

## 10. Testing Strategy

### 10.1 Unit Tests

```bash
# Scoring service
npm run test -- --testPathPattern="scoring.service"

# Queue service
npm run test -- --testPathPattern="queue.service"

# Docker service (mocked)
npm run test -- --testPathPattern="docker.service"
```

### 10.2 Integration Tests

```bash
# Build worker
npm run test -- --testPathPattern="build.worker"

# Evaluate worker
npm run test -- --testPathPattern="evaluate.worker"
```

### 10.3 End-to-End Test Flow

1. Create team
2. Upload Dockerfile
3. Upload source files
4. Create submission
5. Wait for build job
6. Wait for evaluate jobs
7. Verify scores
8. Verify WebSocket events

### 10.4 Test Fixtures

Create test files in `test/fixtures/`:
- `valid-compiler.tar.gz` - Valid compiler archive
- `invalid-compiler.tar.gz` - Archive with syntax errors
- `timeout-compiler.tar.gz` - Archive with infinite loop
- `Dockerfile.valid` - Valid Dockerfile
- `source.lang.valid` - Valid source file

---

## 11. Implementation Checklist

### Phase 1: Core Setup (Day 1-2)

- [ ] Install dependencies (`dockerode`, `@nestjs/platform-socket.io`)
- [ ] Create directory structure
- [ ] Create `job-data.dto.ts`
- [ ] Create queue definitions (`build.queue.ts`, `evaluate.queue.ts`, `cleanup.queue.ts`)
- [ ] Create `jobs.module.ts` with BullMQ integration
- [ ] Add environment variables to `.env.example`
- [ ] Create fallback `Dockerfile`
- [ ] Create `run_test.sh` entrypoint script

### Phase 2: Services (Day 3-4)

- [ ] Implement `docker.service.ts`
- [ ] Implement `scoring.service.ts`
- [ ] Implement `queue.service.ts`
- [ ] Create `websocket.module.ts`
- [ ] Implement `submissions.gateway.ts`
- [ ] Update `app.module.ts` to import new modules

### Phase 3: Workers (Day 5-6)

- [ ] Implement `build.worker.ts`
- [ ] Implement `evaluate.worker.ts`
- [ ] Implement `cleanup.worker.ts`
- [ ] Create worker index with lifecycle management
- [ ] Update `submissions.service.ts` to dispatch jobs

### Phase 4: Integration (Day 7)

- [ ] Wire up all components
- [ ] Test end-to-end flow
- [ ] Verify WebSocket events
- [ ] Test error scenarios
- [ ] Performance testing

### Phase 5: Polish (Day 8)

- [ ] Add logging
- [ ] Add monitoring/metrics
- [ ] Documentation
- [ ] Code review

---

## 12. File Summary

### Files to Create (18 files)

| Path | Purpose |
|------|---------|
| `src/modules/job/dto/job-data.dto.ts` | Job data interfaces |
| `src/modules/job/queues/index.ts` | Queue re-exports |
| `src/modules/job/queues/build.queue.ts` | Build queue |
| `src/modules/job/queues/evaluate.queue.ts` | Evaluate queue |
| `src/modules/job/queues/cleanup.queue.ts` | Cleanup queue |
| `src/modules/job/workers/index.ts` | Worker lifecycle |
| `src/modules/job/workers/build.worker.ts` | Build processor |
| `src/modules/job/workers/evaluate.worker.ts` | Evaluate processor |
| `src/modules/job/workers/cleanup.worker.ts` | Cleanup processor |
| `src/modules/job/services/docker.service.ts` | Docker operations |
| `src/modules/job/services/scoring.service.ts` | Score calculation |
| `src/modules/job/services/queue.service.ts` | Job dispatching |
| `src/modules/job/jobs.module.ts` | Module definition |
| `src/common/docker/fallback/Dockerfile` | Default Dockerfile |
| `src/common/docker/scripts/run_test.sh` | Entrypoint script |
| `src/common/websocket/websocket.module.ts` | WebSocket module |
| `src/common/websocket/submissions.gateway.ts` | Event gateway |
| `src/config/worker.config.ts` | Configuration types |

### Files to Modify (4 files)

| Path | Changes |
|------|---------|
| `src/app.module.ts` | Import JobsModule, WebSocketModule |
| `src/modules/submissions/submissions.module.ts` | Import JobsModule |
| `src/modules/submissions/submissions.service.ts` | Dispatch build job |
| `.env.example` | Add worker config variables |

---

## 13. Next Steps

1. **Review this plan** - Confirm all design decisions
2. **Begin Phase 1** - Create directory structure and install dependencies
3. **Implement incrementally** - Test each component as you build
4. **Integration test** - Full flow validation before deployment
