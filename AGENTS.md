# AGENTS.md - Programming Language Evaluation Framework

This document provides guidance for AI coding agents working in this repository.

## Project Overview

A competitive programming contest framework where teams submit custom compilers that produce native machine code. The system evaluates correctness, performance, and adherence to language design requirements using Docker containerization for secure isolation.

## Monorepo Structure

```
/
├── evaluator-api/          # NestJS backend (port 3000)
├── evaluator-ui/           # React + Vite frontend (port 5173)
├── shared/                 # Shared TypeScript types
├── specification/          # Design documents
└── AGENTS.md
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| API | NestJS 11 with TypeScript, @nestjs/swagger, @nestjs/bullmq |
| Frontend | React 19 + Vite + TanStack Router/Query + shadcn/ui + Tailwind CSS 4 |
| Job Queue | Redis + BullMQ |
| Database | PostgreSQL with Prisma ORM |
| Storage | S3/MinIO for artifacts |

---

## Build/Lint/Test Commands

### Backend (evaluator-api)

```bash
cd evaluator-api

# Development
npm run start:dev              # Start with watch mode
npm run build                  # Build for production

# Code Quality
npm run lint                   # Run ESLint with auto-fix
npm run format                 # Format with Prettier

# Testing
npm run test                   # Run all unit tests
npm run test:watch             # Run tests in watch mode
npm run test:cov               # Run tests with coverage
npm run test:e2e               # Run end-to-end tests

# Single Tests
npm run test -- --testPathPattern="teams.controller"        # By file pattern
npm run test -- --testNamePattern="should create a team"    # By test name
npm run test:e2e -- --testPathPattern="app"                 # Single e2e test

# Database
npx prisma generate            # Generate Prisma client
npx prisma migrate dev         # Run migrations in development
npx prisma studio              # Open Prisma Studio

# Swagger API docs available at http://localhost:3000/docs
```

### Frontend (evaluator-ui)

```bash
cd evaluator-ui

npm run dev                    # Start dev server (port 5173)
npm run build                  # Build for production
npm run lint                   # Run ESLint
npm run preview                # Preview production build
```

### Shared Package

```bash
cd shared

npm run build                  # Build TypeScript
npm run dev                    # Build in watch mode
```

---

## Project Structure

### Backend (evaluator-api)

```
evaluator-api/
├── src/
│   ├── modules/               # Feature modules
│   │   ├── teams/
│   │   │   ├── dto/
│   │   │   ├── entities/
│   │   │   ├── teams.controller.ts
│   │   │   ├── teams.controller.spec.ts
│   │   │   ├── teams.service.ts
│   │   │   ├── teams.service.spec.ts
│   │   │   └── teams.module.ts
│   │   ├── test-cases/
│   │   ├── submissions/
│   │   └── ...
│   ├── common/                # Shared: prisma/, decorators/, filters/, guards/
│   ├── config/                # Configuration
│   ├── workers/               # BullMQ job processors
│   ├── app.module.ts
│   └── main.ts
├── test/                      # E2E tests (*.e2e-spec.ts)
├── prisma/                    # Database schema
└── test-cases/                # YAML test case definitions
```

### Frontend (evaluator-ui)

```
evaluator-ui/
├── src/
│   ├── components/
│   │   ├── ui/                # shadcn/ui components
│   │   ├── teams/             # Team-specific components
│   │   └── test-cases/        # Test case components
│   ├── pages/                 # Route page components
│   ├── lib/
│   │   ├── api-client.ts      # API fetch functions
│   │   ├── queries.ts         # TanStack Query options
│   │   ├── hooks/             # Custom hooks
│   │   └── utils.ts
│   ├── router.tsx             # TanStack Router config
│   └── main.tsx
└── vite.config.ts             # Proxy config for backend
```

### Shared Types

```
shared/src/
├── index.ts                   # Re-export all types
└── types/
    ├── team.ts
    ├── submission.ts
    ├── test-case.ts
    ├── test-run.ts
    └── enums.ts
```

---

## Code Style Guidelines

### Imports (Backend)

```typescript
// 1. NestJS/common packages
import { Controller, Get, Post, Body, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

// 2. External libraries
import * as fs from 'fs';
import * as yaml from 'js-yaml';

// 3. Internal modules (relative)
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { Team } from './entities/team.entity';
```

### Imports (Frontend)

```typescript
// 1. React/external packages
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

// 2. Shared types
import type { TeamDto, TestCaseBlueprint } from '@evaluator/shared';

// 3. Internal modules (alias)
import { teamQueries } from '@/lib/queries';
import { Button } from '@/components/ui/button';
```

### Formatting

- Single quotes for strings (except to avoid escaping)
- Trailing commas in all multiline structures
- 2-space indentation
- Use semicolons
- Max line length: 100 chars (Prettier default)

### TypeScript

- Strict mode enabled
- Explicit return types for public controller methods and service functions
- Prefer `interface` for object shapes, `type` for unions/utility types
- Avoid `any`; use `unknown` when type is truly unknown
- Use `import type` for type-only imports when required by linter

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (classes) | dot-separated | `teams.controller.ts` |
| Files (tests) | dot-separated | `teams.controller.spec.ts` |
| Files (e2e tests) | dot-separated | `app.e2e-spec.ts` |
| Classes | PascalCase | `TeamsController` |
| DTOs | PascalCase + suffix | `CreateTeamDto`, `TestCaseBlueprintDto` |
| Interfaces/Types | PascalCase | `TestCase`, `TestCaseBlueprint` |
| Functions | camelCase | `evaluateTestRun` |
| Constants | SCREAMING_SNAKE | `MAX_TIMEOUT_MS` |
| Enums | PascalCase | `TestRunStatus` |
| React components | PascalCase | `TeamsTable`, `TestCasesPage` |

---

## Backend Patterns

### Controllers

```typescript
@ApiTags('teams')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new team' })
  @ApiResponse({ status: 201, description: 'Team created', type: Team })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  create(@Body() createTeamDto: CreateTeamDto): Promise<Team> {
    return this.teamsService.create(createTeamDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a team by ID' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiResponse({ status: 200, type: Team })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async findOne(@Param('id') id: string): Promise<Team> {
    const team = await this.teamsService.findOne(id);
    if (!team) {
      throw new NotFoundException(`Team with id ${id} not found`);
    }
    return team;
  }
}
```

### DTOs with Swagger

```typescript
export class CreateTeamDto {
  @ApiProperty({ example: 'Compiler Crusaders' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
```

### Error Handling

- Use NestJS exceptions: `NotFoundException`, `BadRequestException`, `ConflictException`
- Never catch and swallow errors silently
- Always include the resource ID in error messages

---

## Frontend Patterns

### API Client

```typescript
// src/lib/api-client.ts
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  return response.json();
}

export const teamsApi = {
  list: () => fetchJson<TeamDto[]>(`/teams`),
  get: (id: string) => fetchJson<TeamDto>(`/teams/${id}`),
  create: (data: CreateTeamDto) => fetchJson<TeamDto>(`/teams`, { method: 'POST', body: JSON.stringify(data) }),
};
```

### Query Options

```typescript
// src/lib/queries.ts
export const teamQueries = {
  list: () => queryOptions({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list(),
  }),
  detail: (id: string) => queryOptions({
    queryKey: ['teams', id],
    queryFn: () => teamsApi.get(id),
  }),
};
```

### Page Components

```typescript
// src/pages/teams/index.tsx
export function TeamsPage() {
  const { data: teams } = useSuspenseQuery(teamQueries.list());
  return ( /* JSX */ );
}
```

### Routes

```typescript
// src/router.tsx
const teamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams',
  component: TeamsPage,
  loader: ({ context }) => context.queryClient.ensureQueryData(teamQueries.list()),
});
```

---

## Test Cases (File-Driven)

Test cases are YAML files in `evaluator-api/test-cases/`:

```yaml
id: TC001
category: arithmetic
name: Integer Addition
description: Add two positive integers and print result
difficulty: 1
args: []
stdin: |
  15
  27
expected_stdout: "42"
expected_exit_code: 0
timeout_ms: 5000
max_memory_mb: 256
points: 10
performance_bonus: true
performance_threshold_ms: 100
```

**Blueprints** (API responses) exclude `expected_stdout` and `expected_exit_code`. These are only revealed in test run results.

---

## Proxy Configuration

Frontend proxies API calls to backend via `vite.config.ts`:

```typescript
server: {
  port: 5173,
  proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: true },
  },
},
```

Backend API endpoints are prefixed with `/api` (e.g., `/api/teams`, `/api/test-cases`).
Swagger docs available at `http://localhost:3000/docs`.

---

## Security Considerations

Container execution must include:
- `--network none` - no external network access
- `--memory` and `--cpus` limits
- `--pids-limit` to prevent fork bombs
- `--security-opt=no-new-privileges`
- `--read-only` filesystem with tmpfs for /tmp
- Timeout enforcement at both container and process level

---

## Specification Documents

Key specification files in `/specification/`:
- `Programming_Language_Evaluation_Framework_Specification.md` - Full system architecture
- `Test_Criteria_Specification.md` - Test case definitions and scoring
