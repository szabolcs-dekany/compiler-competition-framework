# AGENTS.md - Programming Language Evaluation Framework

This document provides guidance for AI coding agents working in this repository.

## Project Overview

A competitive programming contest framework where teams submit custom compilers that produce native machine code. The system evaluates correctness, performance, and adherence to language design requirements using Docker containerization for secure isolation.

## Technology Stack

| Layer | Technology |
|-------|------------|
| API | NestJS 11 with TypeScript, @nestjs/bullmq for job queuing |
| Job Queue | Redis + BullMQ |
| Workers | Node.js with Docker Engine SDK |
| Database | PostgreSQL with Prisma ORM |
| Storage | S3/MinIO for artifacts |

## Build/Lint/Test Commands

```bash
cd evaluator-api

# Development
npm run start:dev        # Start with watch mode
npm run build            # Build for production

# Code Quality
npm run lint             # Run ESLint with auto-fix
npm run format           # Format with Prettier

# Testing
npm run test             # Run all unit tests
npm run test:watch       # Run tests in watch mode
npm run test:cov         # Run tests with coverage
npm run test:e2e         # Run end-to-end tests

# Running Single Tests
npm run test -- --testPathPattern="app.controller"        # Run by file pattern
npm run test -- --testNamePattern="should return Hello"   # Run by test name
npm run test:e2e -- --testPathPattern="app"               # Run single e2e test

# Database (when Prisma schema is added)
npx prisma generate      # Generate Prisma client
npx prisma migrate dev   # Run migrations in development
```

## Project Structure

```
evaluator-api/
├── src/
│   ├── modules/             # Feature modules: teams/, submissions/, test-cases/, leaderboard/, evaluation/
│   ├── common/              # Shared utilities: decorators/, filters/, guards/, interceptors/, pipes/
│   ├── config/              # Configuration
│   ├── workers/             # BullMQ job processors
│   ├── app.module.ts
│   └── main.ts
├── test/                    # E2E tests (*.e2e-spec.ts)
├── prisma/                  # Database schema (schema.prisma)
└── eslint.config.mjs        # ESLint flat config
```

## Code Style Guidelines

### Imports

```typescript
// 1. External packages (NestJS, libraries)
import { Controller, Get, Post, Body } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';

// 2. Internal modules (relative imports)
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
```

### Formatting

- Single quotes for strings (except to avoid escaping)
- Trailing commas in all multiline structures
- 2-space indentation (Prettier default)
- Use semicolons

### TypeScript

- Strict null checks enabled
- Explicit return types for controller methods and service functions
- Prefer `interface` over `type` for object shapes
- Use `type` for unions, intersections, and mapped types
- Avoid `any`; use `unknown` when type is truly unknown

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (classes) | dot-separated | `teams.controller.ts` |
| Files (tests) | dot-separated | `teams.controller.spec.ts`, `app.e2e-spec.ts` |
| Classes | PascalCase | `TeamsController`, `SubmissionsService` |
| DTOs | PascalCase + suffix | `CreateTeamDto` |
| Functions | camelCase | `evaluateTestRun` |
| Constants | SCREAMING_SNAKE | `MAX_TIMEOUT_MS` |
| Enums | PascalCase | `TestRunStatus` |

### NestJS Module Structure

```
teams/
├── dto/create-team.dto.ts
├── entities/team.entity.ts
├── teams.controller.ts
├── teams.controller.spec.ts
├── teams.service.ts
├── teams.service.spec.ts
└── teams.module.ts
```

### Error Handling

- Use NestJS built-in exceptions (`NotFoundException`, `BadRequestException`, etc.)
- Create custom exception classes for domain errors
- Never catch and swallow errors silently

```typescript
if (!team) {
  throw new NotFoundException(`Team with id ${id} not found`);
}
```

### Testing

- Unit tests: `.spec.ts` suffix, placed alongside source files
- E2E tests: `.e2e-spec.ts` suffix, placed in `test/` directory

```typescript
describe('TeamsService', () => {
  let service: TeamsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TeamsService],
    }).compile();
    service = module.get<TeamsService>(TeamsService);
  });

  it('should create a team', async () => {
    const result = await service.create({ name: 'Team A', email: 'a@b.com' });
    expect(result.name).toBe('Team A');
  });
});
```

### Docker Operations

```typescript
const container = await docker.createContainer({
  Image: `team-compiler-${submissionId}`,
  HostConfig: {
    NetworkMode: 'none',
    Memory: 256 * 1024 * 1024,
    CpuPeriod: 100000,
    CpuQuota: 100000,
    PidsLimit: 100,
    SecurityOpt: ['no-new-privileges'],
    ReadonlyRootfs: true,
  },
});
```

### BullMQ Job Queue

```typescript
interface EvaluateTestJobData {
  submissionId: string;
  testCaseId: string;
  sourceFilePath: string;
}

@Processor('evaluation')
export class EvaluationProcessor {
  @Process('evaluate-test')
  async processEvaluateTest(job: Job<EvaluateTestJobData>) {
    const { submissionId, testCaseId, sourceFilePath } = job.data;
  }
}
```

## Security Considerations

Container execution must include:
- `--network none` - no external network access
- `--memory` and `--cpus` limits
- `--pids-limit` to prevent fork bombs
- `--security-opt=no-new-privileges`
- `--read-only` filesystem with tmpfs for /tmp
- Timeout enforcement at both container and process level

## Specification Documents

Key specification files in `/specification/`:
- `Programming_Language_Evaluation_Framework_Specification.md` - Full system architecture
- `Test_Criteria_Specification.md` - Test case definitions and scoring
