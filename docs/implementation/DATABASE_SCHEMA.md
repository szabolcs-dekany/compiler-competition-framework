# Database Schema

## Entity Relationship Diagram

```
┌──────────────┐       ┌─────────────────┐       ┌──────────────┐
│     Team     │───1:N─│   Submission    │───1:N─│   TestRun    │
├──────────────┤       ├─────────────────┤       ├──────────────┤
│ id           │       │ id              │       │ id           │
│ name         │       │ teamId          │       │ submissionId │
│ email        │       │ version         │       │ testCaseId   │
│ createdAt    │       │ compilerPath    │       │ status       │
└──────────────┘       │ status          │       │ compileSuccess│
                       │ submittedAt     │       │ compileTimeMs│
                       │ totalScore      │       │ runSuccess   │
                       └─────────────────┘       │ runTimeMs    │
                                                 │ actualStdout │
                       ┌──────────────┐          │ actualStderr │
                       │   TestCase   │◄─────────│ exitCode     │
                       ├──────────────┤   N:1    │ pointsEarned │
                       │ id           │          │ bonusEarned  │
                       │ category     │          │ errorMessage │
                       │ name         │          │ createdAt    │
                       │ description  │          └──────────────┘
                       │ difficulty   │
                       │ expectedStdout│
                       │ expectedExitCode│
                       │ timeoutMs    │
                       │ maxMemoryMb  │
                       │ points       │
                       │ performanceBonus│
                       │ perfThresholdMs│
                       └──────────────┘
```

## Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Team {
  id          String       @id @default(cuid())
  name        String       @unique
  email       String       @unique
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  submissions Submission[]

  @@index([name])
  @@index([email])
}

model Submission {
  id            String            @id @default(cuid())
  teamId        String
  team          Team              @relation(fields: [teamId], references: [id], onDelete: Cascade)
  version       Int               @default(1)
  compilerPath  String
  status        SubmissionStatus  @default(PENDING)
  submittedAt   DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  testRuns      TestRun[]
  totalScore    Int               @default(0)

  @@index([teamId])
  @@index([status])
  @@index([totalScore(sort: Desc)])
}

model TestCase {
  id               String     @id
  category         String
  name             String
  description      String
  difficulty       Int
  expectedStdout   String     @db.Text
  expectedExitCode Int        @default(0)
  stdin            String?    @db.Text
  args             String[]   @default([])
  timeoutMs        Int
  maxMemoryMb      Int
  points           Int
  performanceBonus Boolean    @default(false)
  perfThresholdMs  Int?
  testRuns         TestRun[]

  @@index([category])
  @@index([difficulty])
}

model TestRun {
  id             String         @id @default(cuid())
  submissionId   String
  testCaseId     String
  submission     Submission    @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  testCase       TestCase      @relation(fields: [testCaseId], references: [id])
  status         TestRunStatus @default(PENDING)
  compileSuccess Boolean?
  compileTimeMs  Int?
  runSuccess     Boolean?
  runTimeMs      Int?
  actualStdout   String?        @db.Text
  actualStderr   String?        @db.Text
  exitCode       Int?
  pointsEarned   Int            @default(0)
  bonusEarned    Int            @default(0)
  errorMessage   String?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@unique([submissionId, testCaseId])
  @@index([submissionId])
  @@index([testCaseId])
  @@index([status])
}

enum SubmissionStatus {
  PENDING
  BUILDING
  READY
  EVALUATING
  COMPLETED
  FAILED
}

enum TestRunStatus {
  PENDING
  COMPILING
  RUNNING
  PASSED
  FAILED
  TIMEOUT
  ERROR
}
```

## Field Descriptions

### Team

| Field | Type | Description |
|-------|------|-------------|
| id | String | Unique identifier (CUID) |
| name | String | Team name (unique) |
| email | String | Contact email (unique) |
| createdAt | DateTime | Record creation timestamp |
| updatedAt | DateTime | Last update timestamp |

### Submission

| Field | Type | Description |
|-------|------|-------------|
| id | String | Unique identifier (CUID) |
| teamId | String | Reference to team |
| version | Int | Submission version (incremental) |
| compilerPath | String | S3 path to compiler archive |
| status | Enum | Current submission status |
| submittedAt | DateTime | Submission timestamp |
| totalScore | Int | Sum of all test run scores |

### TestCase

| Field | Type | Description |
|-------|------|-------------|
| id | String | Test case ID (e.g., "TC001") |
| category | String | Category for grouping |
| name | String | Human-readable name |
| description | String | Detailed description |
| difficulty | Int | 1=Easy, 2=Medium, 3=Hard |
| expectedStdout | Text | Expected output |
| expectedExitCode | Int | Expected exit code |
| stdin | Text? | Input to provide |
| args | String[] | Command-line arguments |
| timeoutMs | Int | Timeout in milliseconds |
| maxMemoryMb | Int | Memory limit in MB |
| points | Int | Base points for passing |
| performanceBonus | Boolean | Whether bonus applies |
| perfThresholdMs | Int? | Threshold for bonus |

### TestRun

| Field | Type | Description |
|-------|------|-------------|
| id | String | Unique identifier |
| submissionId | String | Reference to submission |
| testCaseId | String | Reference to test case |
| status | Enum | Current test run status |
| compileSuccess | Boolean? | Compilation succeeded |
| compileTimeMs | Int? | Compilation duration |
| runSuccess | Boolean? | Execution succeeded |
| runTimeMs | Int? | Execution duration |
| actualStdout | Text? | Captured stdout |
| actualStderr | Text? | Captured stderr |
| exitCode | Int? | Container exit code |
| pointsEarned | Int | Points from this test |
| bonusEarned | Int | Performance bonus |
| errorMessage | String? | Error if any |

## Status Enums

### SubmissionStatus

| Value | Description |
|-------|-------------|
| PENDING | Newly created, awaiting processing |
| BUILDING | Docker image being built |
| READY | Image built, awaiting evaluation |
| EVALUATING | Tests currently running |
| COMPLETED | All tests finished |
| FAILED | Build or critical error |

### TestRunStatus

| Value | Description |
|-------|-------------|
| PENDING | Awaiting execution |
| COMPILING | Compiler running |
| RUNNING | Binary executing |
| PASSED | Test passed |
| FAILED | Test failed |
| TIMEOUT | Execution timed out |
| ERROR | Unexpected error |

## Migrations

### Create Initial Migration

```bash
npx prisma migrate dev --name init
```

### Seed Test Cases

```bash
npx prisma db seed
```

### Reset Database (Development)

```bash
npx prisma migrate reset
```

## Query Examples

### Get Leaderboard

```typescript
const leaderboard = await prisma.submission.findMany({
  where: { status: 'COMPLETED' },
  orderBy: { totalScore: 'desc' },
  take: 10,
  include: {
    team: { select: { name: true } },
  },
});
```

### Get Submission with Test Runs

```typescript
const submission = await prisma.submission.findUnique({
  where: { id: submissionId },
  include: {
    team: true,
    testRuns: {
      include: {
        testCase: { select: { name: true, category: true } },
      },
    },
  },
});
```

### Aggregate Scores by Category

```typescript
const scoresByCategory = await prisma.testRun.groupBy({
  by: ['submissionId'],
  where: { submissionId },
  _sum: {
    pointsEarned: true,
    bonusEarned: true,
  },
});
```
