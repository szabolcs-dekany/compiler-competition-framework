# Phase 2: Job Queue System

**Duration: Week 3**

## Objectives

- Integrate Redis for job queuing
- Implement BullMQ job processing
- Enable parallel test execution
- Implement retry mechanisms and error handling
- Create job monitoring and progress tracking

---

## 2.1 Redis Integration

### Tasks

- [ ] Configure Redis connection
- [ ] Create Redis client singleton
- [ ] Implement connection health checks
- [ ] Set up Redis for both queue and caching

### Files

```
src/lib/redis.ts            # Redis client
src/lib/queue.ts            # Queue configuration
```

### Redis Client

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export { redis };
```

---

## 2.2 Queue Definitions

### Tasks

- [ ] Define queue names and types
- [ ] Create queue factories
- [ ] Configure default job options
- [ ] Set up job prioritization

### Queue Types

| Queue | Purpose | Priority |
|-------|---------|----------|
| `build` | Docker image building | High |
| `evaluate` | Test case evaluation | Normal |
| `cleanup` | Resource cleanup | Low |

### Files

```
src/lib/queues/
├── index.ts
├── build.ts
├── evaluate.ts
└── cleanup.ts
```

### Queue Configuration

```typescript
import { Queue, QueueScheduler } from 'bullmq';

const defaultJobOptions = {
  attempts: 2,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export const buildQueue = new Queue('build', {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    priority: 1,
  },
});

export const evaluateQueue = new Queue('evaluate', {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    priority: 10,
  },
});
```

---

## 2.3 Job Data Types

### Tasks

- [ ] Define TypeScript interfaces for job data
- [ ] Create job data validation schemas
- [ ] Document job data contracts

### Job Data Interfaces

```typescript
interface BuildJobData {
  submissionId: string;
  teamId: string;
  compilerPath: string;
}

interface EvaluateJobData {
  submissionId: string;
  testCaseId: string;
  sourceFilePath: string;
  imageName: string;
}

interface CleanupJobData {
  submissionId: string;
  imageId?: string;
  containerIds?: string[];
}
```

### Files

```
src/types/jobs.ts
```

---

## 2.4 Build Worker

### Tasks

- [ ] Implement Docker image builder
- [ ] Handle build failures
- [ ] Update submission status
- [ ] Create evaluation jobs after successful build

### Build Process Flow

```
1. Download compiler archive from S3
2. Extract to temporary directory
3. Build Docker image from Dockerfile
4. Tag image with submission ID
5. Create evaluate jobs for all test cases
6. Update submission status to READY
```

### Files

```
src/workers/build.ts
src/services/build.ts
```

### Build Worker Implementation

```typescript
import { Worker, Job } from 'bullmq';
import { BuildJobData } from '@/types/jobs';
import { buildDockerImage } from '@/services/build';
import { createEvaluateJobs } from '@/lib/queues/evaluate';

export const buildWorker = new Worker<BuildJobData>(
  'build',
  async (job: Job<BuildJobData>) => {
    const { submissionId, teamId, compilerPath } = job.data;
    
    job.updateProgress(10);
    
    const imagePath = await buildDockerImage({
      submissionId,
      compilerPath,
      onProgress: (progress) => job.updateProgress(progress),
    });
    
    job.updateProgress(90);
    
    await createEvaluateJobs(submissionId, imagePath);
    
    job.updateProgress(100);
    
    return { success: true, imagePath };
  },
  { connection: redis, concurrency: 2 }
);
```

---

## 2.5 Evaluate Worker

### Tasks

- [ ] Implement test case evaluator
- [ ] Handle container execution
- [ ] Compare output with expected
- [ ] Calculate scores and bonuses
- [ ] Update test run records

### Evaluation Flow

```
1. Download source file from S3
2. Create container with security constraints
3. Execute container with timeout
4. Capture stdout, stderr, exit code
5. Compare output with expected
6. Calculate points and bonus
7. Update TestRun record
8. Check if all tests complete
```

### Files

```
src/workers/evaluate.ts
src/services/evaluator.ts
src/services/scoring.ts
```

### Evaluate Worker Implementation

```typescript
import { Worker, Job } from 'bullmq';
import { EvaluateJobData } from '@/types/jobs';
import { evaluateTest } from '@/services/evaluator';
import { calculateScore } from '@/services/scoring';
import { prisma } from '@/lib/prisma';

export const evaluateWorker = new Worker<EvaluateJobData>(
  'evaluate',
  async (job: Job<EvaluateJobData>) => {
    const { submissionId, testCaseId, sourceFilePath, imageName } = job.data;
    
    const testCase = await prisma.testCase.findUnique({
      where: { id: testCaseId },
    });
    
    if (!testCase) throw new Error(`Test case ${testCaseId} not found`);
    
    job.updateProgress(20);
    
    const result = await evaluateTest({
      imageName,
      sourceFilePath,
      timeoutMs: testCase.timeoutMs,
      maxMemoryMb: testCase.maxMemoryMb,
      args: [],
      stdin: null,
    });
    
    job.updateProgress(80);
    
    const { pointsEarned, bonusEarned } = calculateScore({
      actualStdout: result.stdout,
      expectedStdout: testCase.expectedStdout,
      actualExitCode: result.exitCode,
      expectedExitCode: testCase.expectedExitCode,
      runTimeMs: result.runTimeMs,
      points: testCase.points,
      performanceBonus: testCase.performanceBonus,
      perfThresholdMs: testCase.perfThresholdMs,
    });
    
    await prisma.testRun.update({
      where: {
        submissionId_testCaseId: { submissionId, testCaseId },
      },
      data: {
        status: result.status,
        compileSuccess: result.compileSuccess,
        compileTimeMs: result.compileTimeMs,
        runSuccess: result.runSuccess,
        runTimeMs: result.runTimeMs,
        actualStdout: result.stdout,
        actualStderr: result.stderr,
        exitCode: result.exitCode,
        pointsEarned,
        bonusEarned,
        errorMessage: result.errorMessage,
      },
    });
    
    job.updateProgress(100);
    
    return { success: true, pointsEarned, bonusEarned };
  },
  { connection: redis, concurrency: 4 }
);
```

---

## 2.6 Scoring Service

### Tasks

- [ ] Implement output comparison
- [ ] Implement score calculation
- [ ] Implement performance bonus calculation
- [ ] Handle edge cases

### Scoring Logic

```typescript
type ScoreResult = {
  pointsEarned: number;
  bonusEarned: number;
};

function calculateScore(params: {
  actualStdout: string;
  expectedStdout: string;
  actualExitCode: number;
  expectedExitCode: number;
  runTimeMs: number;
  points: number;
  performanceBonus: boolean;
  perfThresholdMs: number | null;
}): ScoreResult {
  const outputMatches = compareOutput(params.actualStdout, params.expectedStdout);
  const exitCodeMatches = params.actualExitCode === params.expectedExitCode;
  
  if (!outputMatches || !exitCodeMatches) {
    return { pointsEarned: 0, bonusEarned: 0 };
  }
  
  const bonusEarned = calculateBonus(
    params.points,
    params.runTimeMs,
    params.perfThresholdMs,
    params.performanceBonus
  );
  
  return { pointsEarned: params.points, bonusEarned };
}

function compareOutput(actual: string, expected: string): boolean {
  const normalizedActual = actual.replace(/\r\n/g, '\n').trim();
  const normalizedExpected = expected.replace(/\r\n/g, '\n').trim();
  return normalizedActual === normalizedExpected;
}

function calculateBonus(
  points: number,
  runTimeMs: number,
  thresholdMs: number | null,
  hasBonus: boolean
): number {
  if (!hasBonus || !thresholdMs) return 0;
  if (runTimeMs >= thresholdMs) return 0;
  return Math.floor(points * 0.2);
}
```

### Files

```
src/services/scoring.ts
```

---

## 2.7 Error Handling

### Tasks

- [ ] Define error types
- [ ] Implement error classification
- [ ] Map container exit codes to statuses
- [ ] Implement retry logic

### Error Types

```typescript
class CompilationError extends Error {
  constructor(message: string, public exitCode: number) {
    super(message);
    this.name = 'CompilationError';
  }
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

class RuntimeError extends Error {
  constructor(message: string, public exitCode: number) {
    super(message);
    this.name = 'RuntimeError';
  }
}
```

### Exit Code Mapping

| Container Exit Code | Framework Status |
|---------------------|------------------|
| 0 | PASSED |
| 100 | COMPILATION_FAILED |
| 137 | TIMEOUT |
| 139 | RUNTIME_ERROR (segfault) |
| Other | FAILED |

### Files

```
src/lib/errors.ts
src/services/evaluator.ts
```

---

## 2.8 Job Events and Progress

### Tasks

- [ ] Set up job event listeners
- [ ] Implement progress tracking
- [ ] Create job completion handlers
- [ ] Trigger WebSocket notifications

### Event Listeners

```typescript
evaluateWorker.on('completed', async (job, result) => {
  await checkSubmissionCompletion(job.data.submissionId);
});

evaluateWorker.on('failed', async (job, err) => {
  await updateTestRunError(job.data.submissionId, job.data.testCaseId, err);
});

buildWorker.on('completed', async (job) => {
  await updateSubmissionStatus(job.data.submissionId, 'READY');
});

buildWorker.on('failed', async (job, err) => {
  await updateSubmissionStatus(job.data.submissionId, 'FAILED');
});
```

### Files

```
src/workers/events.ts
```

---

## 2.9 Submission Completion Handler

### Tasks

- [ ] Detect when all test runs complete
- [ ] Aggregate total scores
- [ ] Update submission status
- [ ] Trigger leaderboard update

### Completion Logic

```typescript
async function checkSubmissionCompletion(submissionId: string): Promise<void> {
  const testRuns = await prisma.testRun.findMany({
    where: { submissionId },
  });
  
  const allComplete = testRuns.every(
    (run) => run.status !== 'PENDING' && run.status !== 'COMPILING' && run.status !== 'RUNNING'
  );
  
  if (!allComplete) return;
  
  const totalScore = testRuns.reduce(
    (sum, run) => sum + run.pointsEarned + run.bonusEarned,
    0
  );
  
  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      status: 'COMPLETED',
      totalScore,
    },
  });
  
  await notifySubmissionComplete(submissionId, totalScore);
}
```

### Files

```
src/services/submission.ts
```

---

## 2.10 Worker Process

### Tasks

- [ ] Create worker entry point
- [ ] Handle graceful shutdown
- [ ] Implement health checks
- [ ] Configure concurrency

### Worker Entry Point

```typescript
import { buildWorker } from './build';
import { evaluateWorker } from './evaluate';

console.log('Workers started');

process.on('SIGTERM', async () => {
  console.log('Shutting down workers...');
  await Promise.all([buildWorker.close(), evaluateWorker.close()]);
  process.exit(0);
});
```

### Files

```
src/workers/index.ts
```

### Package.json Scripts

```json
{
  "scripts": {
    "workers": "tsx src/workers/index.ts",
    "dev:workers": "tsx watch src/workers/index.ts"
  }
}
```

---

## Deliverables Checklist

- [ ] Redis connection configured and tested
- [ ] BullMQ queues created with proper options
- [ ] Build worker functional
- [ ] Evaluate worker functional
- [ ] Scoring calculations correct
- [ ] Error handling comprehensive
- [ ] Job events captured
- [ ] Submission completion detected
- [ ] Worker process stable

---

## Testing Phase 2

### Unit Tests

```bash
npm run test -- --testPathPattern="services/scoring"
npm run test -- --testPathPattern="lib/queues"
```

### Integration Tests

```bash
npm run test -- --testPathPattern="workers/build"
npm run test -- --testPathPattern="workers/evaluate"
```

### Manual Testing

1. Submit a valid submission
2. Verify build job created
3. Check Docker image built
4. Verify evaluate jobs created
5. Check test runs executed
6. Verify scores calculated

---

## Next Phase

→ [Phase 3: Security Hardening](./03_PHASE_3_SECURITY.md)
