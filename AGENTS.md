# AGENTS.md - Programming Language Evaluation Framework

This document provides guidance for AI coding agents working in this repository.

## Project Overview

A competitive programming contest framework where teams submit custom compilers that produce native machine code. The system evaluates correctness, performance, and adherence to language design requirements using Docker containerization for secure isolation.

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 + TypeScript + Tailwind CSS + shadcn/ui |
| API | NestJS with TypeScript, @nestjs/platform-socket.io for WebSockets |
| Job Queue | Redis + BullMQ |
| Workers | Node.js with Docker Engine SDK |
| Database | PostgreSQL with Prisma ORM |
| Storage | S3/MinIO for artifacts |

## Build/Lint/Test Commands

```bash
# Development
npm run dev              # Start Next.js development server
npm run build            # Build for production
npm run start            # Start production server

# Database
npx prisma generate      # Generate Prisma client
npx prisma migrate dev   # Run migrations in development
npx prisma studio        # Open Prisma Studio GUI

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix lint issues
npm run typecheck        # Run TypeScript type checking
npm run format           # Format with Prettier
npm run format:check     # Check formatting

# Testing
npm run test             # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
npm run test -- --testPathPattern="path/to/test"  # Run single test file
npm run test -- --testNamePattern="test name"     # Run specific test by name
npm run test:e2e         # Run end-to-end tests
```

## Project Structure

This is a monorepo with separate frontend and API applications.

```
/
├── apps/
│   ├── web/                     # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/             # Next.js App Router pages
│   │   │   ├── components/      # React components (shadcn/ui)
│   │   │   │   └── ui/          # Base UI components
│   │   │   ├── lib/             # Frontend utilities
│   │   │   └── hooks/           # React hooks
│   │   └── public/              # Static assets
│   └── api/                     # NestJS API
│       ├── src/
│       │   ├── modules/         # Feature modules
│       │   │   ├── teams/
│       │   │   ├── submissions/
│       │   │   ├── test-cases/
│       │   │   ├── leaderboard/
│       │   │   └── websocket/
│       │   ├── common/          # Shared utilities
│       │   │   ├── decorators/
│       │   │   ├── filters/
│       │   │   ├── guards/
│       │   │   ├── interceptors/
│       │   │   └── pipes/
│       │   ├── config/          # Configuration
│       │   └── workers/         # BullMQ job processors
│       └── test/                # API tests
├── packages/
│   └── shared/                  # Shared types and utilities
│       ├── src/
│       │   ├── types/           # TypeScript type definitions
│       │   └── utils/           # Shared utilities
│       └── prisma/
│           └── schema.prisma    # Database schema
├── scripts/                     # Utility scripts (Docker entrypoints, etc.)
└── specification/               # Project specification documents
```

## Code Style Guidelines

### Imports

Order imports as follows, separated by blank lines:

```typescript
// 1. Node.js built-ins
import { readFile } from 'fs/promises';

// 2. External packages
import { Controller, Get, Post } from '@nestjs/common';
import { Container } from 'dockerode';
import { Job } from 'bullmq';

// 3. Internal modules (use @/ alias for app-specific)
import { PrismaService } from '@/prisma/prisma.service';
import { SubmissionsService } from './submissions.service';

// 4. Shared package (use @shared/ alias)
import { Submission, TestCase } from '@shared/types';
import { calculateScore } from '@shared/utils/scoring';
```

Use path aliases configured in `tsconfig.json`:
- `@/*` maps to `./src/*` (within each app)
- `@shared/*` maps to `./packages/shared/src/*`

### Formatting

- Use 2-space indentation
- Single quotes for strings (except to avoid escaping)
- Trailing commas in multiline structures
- Max line length: 100 characters
- Use semicolons

### TypeScript

- Strict mode enabled
- Prefer `interface` over `type` for object shapes
- Use `type` for unions, intersections, and mapped types
- Explicit return types for exported functions
- Avoid `any`; use `unknown` when type is truly unknown

```typescript
// Preferred
interface TestRun {
  id: string;
  status: TestRunStatus;
  pointsEarned: number;
}

export async function evaluateSubmission(submissionId: string): Promise<TestResult[]> {
  // ...
}

// Avoid
const processData = (data: any) => { ... }
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (components) | PascalCase | `TestRunner.tsx` |
| Files (utilities) | camelCase | `dockerClient.ts` |
| Files (pages) | kebab-case | `test-runs/page.tsx` |
| Files (NestJS modules) | dot-separated | `teams.module.ts`, `teams.service.ts` |
| React components | PascalCase | `SubmissionCard` |
| Functions | camelCase | `evaluateTestRun` |
| Constants | SCREAMING_SNAKE | `MAX_TIMEOUT_MS` |
| Enums | PascalCase | `TestRunStatus` |
| Interfaces | PascalCase | `TestCase` |

### Error Handling

- Use custom error classes for domain errors
- Never catch and swallow errors silently
- Log errors with structured logging (include correlation IDs)
- Return `Result<T, E>` pattern for operations that can fail

```typescript
// Define in src/lib/errors.ts
class CompilationError extends Error {
  constructor(message: string, public exitCode: number) {
    super(message);
    this.name = 'CompilationError';
  }
}

// Use Result pattern
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

function compareOutput(actual: string, expected: string): Result<boolean> {
  if (actual.trim() === expected.trim()) {
    return { ok: true, value: true };
  }
  return { ok: false, error: new Error('Output mismatch') };
}
```

### React Components

- Use function components with hooks
- Co-locate types with components when specific to that component
- Use shadcn/ui components as building blocks
- Keep components small and focused

```typescript
interface SubmissionStatusProps {
  submissionId: string;
  status: TestRunStatus;
}

export function SubmissionStatus({ submissionId, status }: SubmissionStatusProps) {
  // ...
}
```

### Database Operations

- Always use Prisma Client (never raw SQL unless necessary)
- Use transactions for operations that must be atomic
- Include only needed fields in select

```typescript
const submission = await this.prisma.submission.findUnique({
  where: { id: submissionId },
  select: {
    id: true,
    status: true,
    testRuns: {
      select: { testCaseId: true, status: true, pointsEarned: true },
    },
  },
});
```

### Docker Operations

- Use dockerode (Docker Engine SDK for Node.js)
- Always set resource limits and security options
- Clean up containers with `--rm` or explicit removal

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

### Job Queue (BullMQ)

- Define job names as constants
- Use typed job data and return values
- Implement idempotent job processors

```typescript
interface EvaluateTestJobData {
  submissionId: string;
  testCaseId: string;
  sourceFilePath: string;
}

const queue = new Queue('evaluation', { connection: redis });

await queue.add('evaluate-test', {
  submissionId,
  testCaseId,
  sourceFilePath,
} satisfies EvaluateTestJobData);
```

## Security Considerations

When working with container execution code, always include:

- `--network none` - no external network access
- `--memory` and `--cpus` limits
- `--pids-limit` to prevent fork bombs
- `--security-opt=no-new-privileges`
- `--read-only` filesystem with tmpfs for /tmp
- Timeout enforcement at both container and process level

## Specification Documents

Key specification files are in `/specification/`:
- `Programming_Language_Evaluation_Framework_Specification.md` - Full system architecture
- `Test_Criteria_Specification.md` - Test case definitions and scoring

Refer to these for detailed requirements on submission formats, evaluation pipeline, and scoring logic.

## Commit Guidelines

- Write clear, descriptive commit messages
- Reference issue numbers when applicable
- Keep commits atomic (one logical change per commit)
