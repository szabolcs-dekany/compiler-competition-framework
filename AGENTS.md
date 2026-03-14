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
├── docker/                 # Docker configuration files
└── AGENTS.md
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| API | NestJS 11, TypeScript, @nestjs/swagger, @nestjs/bullmq, Prisma ORM |
| Frontend | React 19, Vite, TanStack Router/Query, shadcn/ui, Tailwind CSS 4 |
| Job Queue | Redis + BullMQ |
| Database | PostgreSQL |
| Storage | S3-compatible (Garage) |

---

## Build/Lint/Test Commands

### Backend (evaluator-api)

```bash
cd evaluator-api

# Development
npm run start:dev              # Start with watch mode
npm run build                  # Build for production (use `nest build`, NOT `tsc`)

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

### Infrastructure

```bash
# From project root
docker-compose up -d           # Start PostgreSQL, Redis, Garage (S3)
```

---

## Project Structure

### Backend (evaluator-api)

```
evaluator-api/
├── src/
│   ├── modules/               # Feature modules
│   │   ├── teams/
│   │   │   ├── dto/           # Data Transfer Objects
│   │   │   ├── entities/      # Swagger entities
│   │   │   ├── teams.controller.ts
│   │   │   ├── teams.controller.spec.ts
│   │   │   ├── teams.service.ts
│   │   │   ├── teams.service.spec.ts
│   │   │   └── teams.module.ts
│   │   ├── source-files/
│   │   ├── submissions/
│   │   └── test-cases/
│   ├── common/                # Shared: prisma/, storage/, decorators/, filters/, guards/
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
│   │   ├── source-files/      # Source file components
│   │   ├── teams/             # Team-specific components
│   │   └── test-cases/        # Test case components
│   ├── pages/                 # Route page components (mirrors route structure)
│   │   ├── teams/
│   │   │   ├── index.tsx      # /teams
│   │   │   └── [teamId]/      # /teams/:teamId
│   │   ├── submissions/
│   │   └── test-cases/
│   ├── lib/
│   │   ├── api-client.ts      # API fetch functions grouped by resource
│   │   ├── queries.ts         # TanStack Query options grouped by resource
│   │   ├── hooks/             # Custom hooks (mutations, etc.)
│   │   ├── query-client.ts    # Query client instance
│   │   └── utils.ts           # Utility functions
│   ├── router.tsx             # TanStack Router config with loaders
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
    ├── source-file.ts
    └── enums.ts
```

---

## Code Style Guidelines

### Imports (Backend)

```typescript
// 1. NestJS/common packages
import { Controller, Get, Post, Body, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

// 2. External libraries (use namespace imports for node modules)
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';

// 3. Shared types (use import type for type-only imports)
import type { SourceFileDto, SourceFileListDto } from '@evaluator/shared';

// 4. Internal modules (relative)
import { SourceFilesService } from './source-files.service';
import { UploadSourceFileDto } from './dto/upload-source-file.dto';
import { SourceFileEntity } from './entities/source-file.entity';
```

### Imports (Frontend)

```typescript
// 1. React/external packages
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

// 2. Shared types
import type { TeamDto, TestCaseBlueprint, UploadSourceFileDto } from '@evaluator/shared';

// 3. Internal modules (using @ alias)
import { teamQueries, sourceFileQueries } from '@/lib/queries';
import { sourceFilesApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
```

### Formatting

- Single quotes for strings (except to avoid escaping)
- Trailing commas in all multiline structures
- 2-space indentation
- Use semicolons
- Max line length: 100 chars (Prettier default)
- No comments unless explicitly requested

### TypeScript

- Strict mode enabled
- Explicit return types for public controller methods and service functions
- Prefer `interface` for object shapes, `type` for unions/utility types
- Avoid `any`; use `unknown` when type is truly unknown
- Use `import type` for type-only imports from shared package

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (classes) | dot-separated | `teams.controller.ts` |
| Files (tests) | dot-separated | `teams.controller.spec.ts` |
| Files (e2e tests) | dot-separated | `app.e2e-spec.ts` |
| Classes | PascalCase | `TeamsController` |
| DTOs | PascalCase + suffix | `CreateTeamDto`, `UploadSourceFileDto` |
| Entities (Swagger) | PascalCase + suffix | `TeamEntity`, `SourceFileEntity` |
| Interfaces/Types | PascalCase | `TestCase`, `SourceFileListDto` |
| Functions | camelCase | `evaluateTestRun` |
| Constants | SCREAMING_SNAKE | `MAX_TIMEOUT_MS` |
| Enums | PascalCase | `TestRunStatus`, `SubmissionStatus` |
| React components | PascalCase | `TeamsTable`, `TeamDetailPage` |
| React hooks | camelCase + use prefix | `useUploadSourceFile` |

---

## Important Notes

### ID Format
- Prisma uses `@default(cuid())` which generates CUIDs (like `clx123abc`), NOT UUIDs
- Controllers must NOT use `ParseUUIDPipe` - use plain `@Param('id')` instead

### Build Commands
- Use `nest build` for backend, NOT `tsc` directly (decorator metadata issues)
- Frontend uses `tsc -b && vite build`

### Checksum Display
- Truncate SHA256 checksums to first 8 characters (e.g., `a1b2c3d4...`)

### API Prefix
- Backend endpoints are prefixed with `/api` (e.g., `/api/teams`, `/api/test-cases`)
- Frontend proxies `/api` to backend via vite.config.ts

---

## Backend Patterns

### Controllers

```typescript
@ApiTags('source-files')
@Controller('source-files')
export class SourceFilesController {
  constructor(private readonly sourceFilesService: SourceFilesService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a source file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['teamId'], properties: { teamId: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'Created', type: SourceFileEntity })
  @ApiResponse({ status: 404, description: 'Team not found' })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Body() dto: UploadSourceFileDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<SourceFileEntity> {
    return this.sourceFilesService.create(dto, file);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get by ID' })
  @ApiParam({ name: 'id', description: 'Resource ID' })
  @ApiResponse({ status: 200, type: SourceFileEntity })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Param('id') id: string): Promise<SourceFileEntity> {
    return this.sourceFilesService.findOne(id);
  }
}
```

### Services

```typescript
@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createTeamDto: CreateTeamDto): Promise<Team> {
    return this.prisma.team.create({
      data: { name: createTeamDto.name },
    });
  }

  async findOne(id: string): Promise<Team | null> {
    return this.prisma.team.findUnique({ where: { id } });
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
- Always include the resource ID in error messages: `Team with id ${id} not found`

### Entity Classes (Swagger)

```typescript
export class SourceFileEntity {
  @ApiProperty({ example: 'clx123abc' })
  id: string;

  @ApiProperty({ example: 'TC001' })
  testCaseId: string;
}
```

---

## Frontend Patterns

### API Client

```typescript
// src/lib/api-client.ts
const API_BASE = '/api';

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
  list: () => fetchJson<TeamDto[]>(`${API_BASE}/teams`),
  get: (id: string) => fetchJson<TeamDto>(`${API_BASE}/teams/${id}`),
  create: (data: CreateTeamDto) =>
    fetchJson<TeamDto>(`${API_BASE}/teams`, { method: 'POST', body: JSON.stringify(data) }),
};
```

### Query Options

```typescript
// src/lib/queries.ts
export const teamQueries = {
  list: () =>
    queryOptions({
      queryKey: ['teams'],
      queryFn: () => teamsApi.list(),
    }),

  detail: (id: string) =>
    queryOptions({
      queryKey: ['teams', id],
      queryFn: () => teamsApi.get(id),
    }),
};
```

### Mutation Hooks

```typescript
// src/lib/hooks/use-source-files-mutations.ts
export function useUploadSourceFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, file }: { data: UploadSourceFileDto; file: File }) =>
      sourceFilesApi.upload(data, file),
    onSuccess: (_, { data }) => {
      queryClient.invalidateQueries({
        queryKey: sourceFileQueries.list(data.teamId).queryKey,
      });
    },
  });
}
```

### Page Components

```typescript
// src/pages/teams/[teamId]/index.tsx
export function TeamDetailPage() {
  const { teamId } = useParams({ from: '/teams/$teamId' });
  const { data: team } = useSuspenseQuery(teamQueries.detail(teamId));
  const { data: sourceFiles } = useSuspenseQuery(sourceFileQueries.list(teamId));

  return (
    <div className="space-y-6">
      {/* JSX */}
    </div>
  );
}
```

### Routes with Loaders

```typescript
// src/router.tsx
const teamDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams/$teamId',
  component: TeamDetailPage,
  loader: ({ context, params }) => {
    context.queryClient.ensureQueryData(teamQueries.detail(params.teamId));
    context.queryClient.ensureQueryData(sourceFileQueries.list(params.teamId));
  },
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

**Blueprints** (API responses) exclude `expected_stdout` and `expected_exit_code`.

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

## Infrastructure Ports

| Service | Port |
|---------|------|
| Backend API | 3000 |
| Frontend Dev | 5173 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Garage (S3) | 9000 |
| Garage Admin | 3909 |
| Swagger Docs | 3000/docs |
