# Phase 1: Core Infrastructure

**Duration: Week 1-2**

## Objectives

- Set up project structure and dependencies
- Implement database schema with Prisma
- Create basic API endpoints for teams and submissions
- Implement file upload handling and validation
- Create Docker worker skeleton

---

## 1.1 Project Initialization

### Tasks

- [x] Initialize monorepo structure with npm workspaces
- [x] Create Next.js 16 frontend app with TypeScript
- [x] Create NestJS API app with TypeScript
- [x] Configure Tailwind CSS and shadcn/ui for frontend
- [x] Set up ESLint, Prettier, and TypeScript configs
- [x] Create shared types package
- [x] Create directory structure as per AGENTS.md

### Commands

```bash
# Create monorepo structure
mkdir -p apps/web apps/api packages/shared

# Initialize root package.json with workspaces
npm init -y

# Create Next.js frontend
cd apps/web
npx create-next-app@latest . --typescript --tailwind --eslint --app
npx shadcn@latest init

# Create NestJS API
cd ../api
npx @nestjs/cli new .

# Install shared dependencies
cd ../..
npm install prisma @prisma/client -w packages/shared
npm install bullmq ioredis -w apps/api
npm install dockerode -w apps/api
npm install @aws-sdk/client-s3 -w apps/api
npm install zod -w packages/shared
npm install -D @types/dockerode -w apps/api
```

### Files to Create

```
├── package.json                 # Root with workspaces config
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.js
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── api-client.ts
│   │       │   └── query-client.ts
│   │       └── hooks/
│   └── api/
│       ├── package.json
│       ├── tsconfig.json
│       ├── nest-cli.json
│       └── src/
│           ├── main.ts
│           ├── app.module.ts
│           ├── config/
│           │   ├── database.config.ts
│           │   ├── redis.config.ts
│           │   └── s3.config.ts
│           └── common/
│               ├── filters/
│               ├── guards/
│               ├── interceptors/
│               └── pipes/
└── packages/
    └── shared/
        ├── package.json
        ├── tsconfig.json
        ├── src/
        │   ├── types/
        │   │   └── index.ts
        │   └── utils/
        │       └── scoring.ts
        └── prisma/
            ├── schema.prisma
            └── seed.ts
```

---

## 1.2 Database Schema

### Tasks

- [ ] Design Prisma schema based on specification
- [ ] Create initial migration
- [ ] Generate Prisma client
- [ ] Create database utilities

### Schema Implementation

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema.

### Key Models

```prisma
model Team {
  id          String       @id @default(cuid())
  name        String       @unique
  email       String       @unique
  createdAt   DateTime     @default(now())
  submissions Submission[]
}

model Submission {
  id            String     @id @default(cuid())
  teamId        String
  team          Team       @relation(fields: [teamId], references: [id])
  version       Int        @default(1)
  compilerPath  String
  status        SubmissionStatus @default(PENDING)
  submittedAt   DateTime   @default(now())
  testRuns      TestRun[]
  totalScore    Int        @default(0)
}

model TestCase {
  id              String   @id
  category        String
  name            String
  description     String
  difficulty      Int
  expectedStdout  String
  expectedExitCode Int     @default(0)
  timeoutMs       Int
  maxMemoryMb     Int
  points          Int
  performanceBonus Boolean @default(false)
  perfThresholdMs Int?
  testRuns        TestRun[]
}

model TestRun {
  id              String   @id @default(cuid())
  submissionId    String
  testCaseId      String
  submission      Submission @relation(fields: [submissionId], references: [id])
  testCase        TestCase @relation(fields: [testCaseId], references: [id])
  status          TestRunStatus @default(PENDING)
  compileSuccess  Boolean?
  compileTimeMs   Int?
  runSuccess      Boolean?
  runTimeMs       Int?
  actualStdout    String?
  actualStderr    String?
  exitCode        Int?
  pointsEarned    Int      @default(0)
  bonusEarned     Int      @default(0)
  errorMessage    String?
  createdAt       DateTime @default(now())
}
```

### Migration Commands

```bash
npx prisma migrate dev --name init
npx prisma generate
```

---

## 1.3 Storage Service

### Tasks

- [ ] Configure S3/MinIO client
- [ ] Implement upload functionality
- [ ] Implement download functionality
- [ ] Create presigned URL generation
- [ ] Handle file validation

### Files

```
src/lib/s3.ts              # S3 client configuration
src/services/storage.ts    # Storage service
```

### Storage Service Interface

```typescript
interface StorageService {
  uploadCompiler(teamId: string, file: Buffer, filename: string): Promise<string>;
  uploadSourceFile(submissionId: string, testCaseId: string, content: string): Promise<string>;
  downloadArtifact(path: string): Promise<Buffer>;
  getPresignedUrl(path: string, expiresIn?: number): Promise<string>;
  deleteArtifact(path: string): Promise<void>;
}
```

---

## 1.4 Basic API Endpoints

### Tasks

- [ ] Create NestJS modules for each domain
- [ ] Implement team registration endpoint
- [ ] Implement submission upload endpoint
- [ ] Implement submission status endpoint
- [ ] Implement test case listing endpoints
- [ ] Add request validation with class-validator

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/teams | Register new team |
| GET | /api/teams/:id | Get team details |
| POST | /api/submissions | Submit compiler + sources |
| GET | /api/submissions/:id | Get submission status |
| GET | /api/submissions/:id/runs | Get test runs |
| GET | /api/test-cases | List test cases |
| GET | /api/test-cases/:id | Get test case |

### Implementation Files

```
apps/api/src/
├── modules/
│   ├── teams/
│   │   ├── teams.module.ts
│   │   ├── teams.controller.ts
│   │   ├── teams.service.ts
│   │   └── dto/
│   │       ├── create-team.dto.ts
│   │       └── team.response.dto.ts
│   ├── submissions/
│   │   ├── submissions.module.ts
│   │   ├── submissions.controller.ts
│   │   ├── submissions.service.ts
│   │   └── dto/
│   │       ├── create-submission.dto.ts
│   │       └── submission.response.dto.ts
│   ├── test-cases/
│   │   ├── test-cases.module.ts
│   │   ├── test-cases.controller.ts
│   │   ├── test-cases.service.ts
│   │   └── dto/
│   │       └── test-case.response.dto.ts
│   └── leaderboard/
│       ├── leaderboard.module.ts
│       ├── leaderboard.controller.ts
│       └── leaderboard.service.ts
└── common/
    ├── decorators/
    ├── filters/
    │   └── http-exception.filter.ts
    ├── interceptors/
    │   └── transform.interceptor.ts
    └── pipes/
        └── validation.pipe.ts
```

---

## 1.5 Submission Validation

### Tasks

- [ ] Validate submission archive structure
- [ ] Validate Dockerfile presence
- [ ] Validate compile.sh script
- [ ] Validate source file naming
- [ ] Create validation service

### Validation Rules

```typescript
interface SubmissionValidation {
  requiredFiles: ['Dockerfile', 'compile.sh'];
  sourceFilePattern: /^[A-Z]{2}\d{3}_.+\.lang$/;
  maxFileSize: 50 * 1024 * 1024; // 50MB
  allowedArchiveTypes: ['.tar.gz', '.zip'];
}
```

### Files

```
src/services/validation.ts
```

---

## 1.6 Docker Worker Skeleton

### Tasks

- [ ] Create Docker client configuration
- [ ] Implement basic container creation
- [ ] Implement image building
- [ ] Create worker entry point

### Files

```
src/lib/docker.ts           # Docker client
src/workers/index.ts        # Worker entry point
src/workers/build.ts        # Image builder
scripts/docker/run_test.sh  # Injected entrypoint
```

### Docker Client Configuration

```typescript
import Docker from 'dockerode';

export const docker = new Docker({
  socketPath: '/var/run/docker.sock',
});

export const DOCKER_CONFIG = {
  network: 'none',
  memory: 256 * 1024 * 1024,
  cpuPeriod: 100000,
  cpuQuota: 100000,
  pidsLimit: 100,
  securityOpt: ['no-new-privileges'],
};
```

### Injected Entrypoint Script

```bash
#!/bin/bash
# scripts/docker/run_test.sh

SOURCE_FILE="$1"
OUTPUT_BIN="/workspace/output"
shift
ARGS="$@"

echo "=== COMPILATION PHASE ==="
/compile.sh "$SOURCE_FILE" "$OUTPUT_BIN"
COMPILE_EXIT=$?

if [ $COMPILE_EXIT -ne 0 ]; then
    echo "COMPILATION_FAILED:$COMPILE_EXIT"
    exit 100
fi

echo "=== EXECUTION PHASE ==="
chmod +x "$OUTPUT_BIN"
exec "$OUTPUT_BIN" $ARGS
```

---

## 1.7 Test Case Seeding

### Tasks

- [ ] Parse test case YAML files
- [ ] Create seed script
- [ ] Populate database with test cases

### Files

```
prisma/seed.ts              # Seed script
scripts/test-cases.yaml     # Test case definitions
```

### Seed Command

```bash
npx prisma db seed
```

---

## 1.8 Environment Configuration

### Tasks

- [ ] Create environment variable schema
- [ ] Implement config validation
- [ ] Create .env.example

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/evaluator"

# Redis
REDIS_URL="redis://localhost:6379"

# S3/MinIO
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="submissions"

# Docker
DOCKER_SOCKET="/var/run/docker.sock"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Files

```
src/lib/config.ts           # Config validation
.env.example
```

---

## Deliverables Checklist

- [ ] Project initialized with all dependencies
- [ ] Database schema migrated and client generated
- [ ] Storage service functional
- [ ] API endpoints responding correctly
- [ ] Submission validation working
- [ ] Docker client can create containers
- [ ] Test cases seeded in database
- [ ] Environment configuration validated

---

## Testing Phase 1

### Unit Tests

```bash
npm run test -- --testPathPattern="services/validation"
npm run test -- --testPathPattern="services/storage"
npm run test -- --testPathPattern="lib/docker"
```

### Integration Tests

```bash
npm run test -- --testPathPattern="api/teams"
npm run test -- --testPathPattern="api/submissions"
```

### Manual Testing

1. Register a team via API
2. Upload a valid submission archive
3. Verify database records created
4. Check S3 storage for artifacts

---

## Next Phase

→ [Phase 2: Job Queue System](./02_PHASE_2_JOB_QUEUE.md)
