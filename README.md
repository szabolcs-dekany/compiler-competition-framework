# Programming Language Evaluation Framework

A competitive programming contest framework where teams submit custom compilers that produce native machine code. The system evaluates correctness, performance, and adherence to language design requirements using Docker containerization for secure isolation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│                    http://localhost:5173                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend API (NestJS)                      │
│                    http://localhost:3000                         │
└─────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │PostgreSQL│   │  Redis   │   │  Garage  │   │  Docker  │
   │  :5432   │   │  :6379   │   │  :9000   │   │ (eval)   │
   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

## Monorepo Structure

```
/
├── evaluator-api/       # NestJS backend (port 3000)
├── evaluator-ui/        # React + Vite frontend (port 5173)
├── shared/              # Shared TypeScript types
├── docker/              # Docker configuration files
├── specification/       # Design documents
└── AGENTS.md            # AI coding agent guidelines
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TanStack Router/Query, shadcn/ui, Tailwind CSS 4 |
| Backend | NestJS 11, TypeScript, Prisma ORM, BullMQ |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 |
| Storage | S3-compatible (Garage) |
| Containerization | Docker |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm 10+

### 1. Start Infrastructure

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- Garage (S3) on port 9000
- Garage WebUI on port 3909

### 2. Setup Backend

```bash
cd evaluator-api
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

API runs on `http://localhost:3000`
Swagger docs at `http://localhost:3000/docs`

### 3. Setup Frontend

```bash
cd evaluator-ui
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

### 4. Build Shared Types

```bash
cd shared
npm install
npm run build
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 5173 | React dev server |
| Backend API | 3000 | NestJS REST API |
| Swagger UI | 3000/docs | API documentation |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Job queue |
| Garage | 9000 | S3-compatible storage |
| Garage Admin | 3909 | Storage web UI |

## API Endpoints

| Resource | Endpoints |
|----------|-----------|
| Teams | `GET/POST /api/teams`, `GET/DELETE /api/teams/:id` |
| Test Cases | `GET /api/test-cases`, `GET /api/test-cases/:id` |
| Source Files | `GET/POST /api/source-files`, `GET/PUT /api/source-files/:id` |
| Submissions | `GET/POST /api/submissions`, `GET /api/submissions/:id/test-runs` |

Full API documentation available at `http://localhost:3000/docs`

## Development

### Package Scripts

```bash
# Backend (from evaluator-api/)
npm run start:dev          # Dev server with hot reload
npm run build              # Production build
npm run test               # Unit tests
npm run test:e2e           # E2E tests
npm run lint               # ESLint

# Frontend (from evaluator-ui/)
npm run dev                # Dev server
npm run build              # Production build
npm run lint               # ESLint

# Shared (from shared/)
npm run build              # Build TypeScript types
npm run dev                # Watch mode
```

### Database Management

```bash
cd evaluator-api

npx prisma studio          # Open database GUI
npx prisma migrate dev     # Create and apply migration
npx prisma generate        # Generate Prisma client
```

## Project Workflow

1. **Teams** register in the system
2. **Test Cases** are defined as YAML files with inputs/expected outputs
3. **Source Files** are uploaded by teams for each test case
4. **Submissions** trigger evaluation:
   - Compiler builds in Docker container
   - Test runs execute against test cases
   - Results scored for correctness and performance

## Test Cases

Test cases are YAML files in `evaluator-api/test-cases/`:

```yaml
id: TC001
category: arithmetic
name: Integer Addition
description: Add two positive integers and print result
difficulty: 1
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

## Security

Container execution enforces:
- No network access (`--network none`)
- Memory and CPU limits
- Process limits (`--pids-limit`)
- Read-only filesystem with tmpfs
- No privilege escalation

## Package READMEs

- [evaluator-api/README.md](./evaluator-api/README.md) - Backend documentation
- [evaluator-ui/README.md](./evaluator-ui/README.md) - Frontend documentation

## License

UNLICENSED - Private project
