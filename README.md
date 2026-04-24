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
- npm 10+
- Docker Engine with Docker Compose
- A working Docker socket at `/var/run/docker.sock` (or update `DOCKER_SOCKET_PATH` in `evaluator-api/.env` for Podman)

### 1. Install Workspace Dependencies

From the repository root:

```bash
npm install
```

### 2. Start Infrastructure

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- Garage (S3) on port 9000
- Garage WebUI on port 3909

### 3. Configure the Backend

```bash
cp evaluator-api/.env.example evaluator-api/.env
```

The default environment values already match the local Docker Compose services, including the Garage development credentials. The backend creates the `evaluator-artifacts` bucket on startup if it does not exist.

### 4. Build Shared Types

The API and UI both import `@evaluator/shared`, so build it before starting either app:

```bash
npm run build --workspace shared
```

If you plan to edit shared types during development, run the watch mode in a separate terminal instead:

```bash
npm run dev --workspace shared
```

### 5. Start the Backend

Run database setup once, then start the API:

```bash
npx prisma generate --schema evaluator-api/prisma/schema.prisma
npx prisma migrate dev --schema evaluator-api/prisma/schema.prisma
npm run start:dev --workspace evaluator-api
```

API runs on `http://localhost:3000`
Swagger docs at `http://localhost:3000/docs`

### 6. Start the Frontend

Open another terminal from the repository root:

```bash
npm run dev --workspace evaluator-ui
```

Frontend runs on `http://localhost:5173`
The Vite dev server proxies `/api` requests to the backend at `http://localhost:3000`

### Suggested Terminal Layout

Use 2-3 terminals from the repository root:
- `npm run build --workspace shared` once before startup, or `npm run dev --workspace shared` if editing shared code
- `npm run start:dev --workspace evaluator-api`
- `npm run dev --workspace evaluator-ui`

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
# Backend
npm run start:dev --workspace evaluator-api
npm run build --workspace evaluator-api
npm run test --workspace evaluator-api
npm run test:e2e --workspace evaluator-api
npm run lint --workspace evaluator-api

# Frontend
npm run dev --workspace evaluator-ui
npm run build --workspace evaluator-ui
npm run lint --workspace evaluator-ui

# Shared
npm run build --workspace shared
npm run dev --workspace shared
```

### Database Management

```bash
npx prisma studio --schema evaluator-api/prisma/schema.prisma
npx prisma migrate dev --schema evaluator-api/prisma/schema.prisma
npx prisma generate --schema evaluator-api/prisma/schema.prisma
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
