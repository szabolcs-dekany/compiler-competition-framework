# Implementation Plan Overview

## Project Summary

Programming Language Evaluation Framework - a competitive programming contest system where teams submit custom compilers that produce native machine code. The system evaluates correctness, performance, and adherence to language design requirements using Docker containerization.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│  Next.js 16 + TypeScript + Tailwind + shadcn/ui Dashboard   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      API LAYER                               │
│  NestJS with TypeScript + WebSocket Gateways                │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    JOB QUEUE LAYER                           │
│  Redis + BullMQ for async job processing                    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   WORKER LAYER                               │
│  Node.js workers with Docker Engine SDK                     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                │
│  PostgreSQL (Prisma) + Redis + S3/MinIO                     │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Phases

| Phase | Duration | Focus | Documents |
|-------|----------|-------|-----------|
| **Phase 1** | Week 1-2 | Core Infrastructure | [01_PHASE_1_CORE.md](./01_PHASE_1_CORE.md) |
| **Phase 2** | Week 3 | Job Queue System | [02_PHASE_2_JOB_QUEUE.md](./02_PHASE_2_JOB_QUEUE.md) |
| **Phase 3** | Week 4 | Security Hardening | [03_PHASE_3_SECURITY.md](./03_PHASE_3_SECURITY.md) |
| **Phase 4** | Week 5 | Dashboard & Real-time | [04_PHASE_4_FRONTEND.md](./04_PHASE_4_FRONTEND.md) |
| **Phase 5** | Week 6 | Testing & Polish | [05_PHASE_5_TESTING.md](./05_PHASE_5_TESTING.md) |

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 16, TypeScript, Tailwind, shadcn/ui | Dashboard UI |
| API | NestJS, @nestjs/platform-socket.io | REST + WebSocket |
| Job Queue | Redis, BullMQ | Async job processing |
| Workers | Node.js, Dockerode | Container execution |
| Database | PostgreSQL, Prisma | Data persistence |
| Storage | S3/MinIO | Artifact storage |
| Cache | Redis | Caching, pub/sub |

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Entrypoint Strategy | Runtime injection via `--entrypoint` | Maximum flexibility for teams |
| Submission Model | Single compiler, source file per test | Cleaner separation |
| Correctness Criteria | Exact string match + exit code | Deterministic evaluation |
| Scoring Model | Pass/fail + 20% performance bonus | Balance correctness/efficiency |
| Security Approach | Defense-in-depth with Docker options | Multiple protection layers |

## Project Structure

```
/
├── apps/
│   ├── web/                        # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/                # Next.js App Router pages
│   │   │   │   ├── (dashboard)/    # Dashboard pages
│   │   │   │   └── layout.tsx
│   │   │   ├── components/         # React components
│   │   │   │   ├── ui/             # shadcn/ui base components
│   │   │   │   ├── dashboard/      # Dashboard-specific
│   │   │   │   ├── submission/     # Submission-related
│   │   │   │   └── leaderboard/    # Leaderboard components
│   │   │   ├── lib/                # Frontend utilities
│   │   │   │   ├── api-client.ts
│   │   │   │   └── query-client.ts
│   │   │   └── hooks/              # React hooks
│   │   └── public/                 # Static assets
│   └── api/                        # NestJS API
│       ├── src/
│       │   ├── main.ts             # Application entry point
│       │   ├── app.module.ts       # Root module
│       │   ├── modules/            # Feature modules
│       │   │   ├── teams/
│       │   │   │   ├── teams.module.ts
│       │   │   │   ├── teams.controller.ts
│       │   │   │   ├── teams.service.ts
│       │   │   │   └── dto/
│       │   │   ├── submissions/
│       │   │   │   ├── submissions.module.ts
│       │   │   │   ├── submissions.controller.ts
│       │   │   │   ├── submissions.service.ts
│       │   │   │   └── dto/
│       │   │   ├── test-cases/
│       │   │   ├── leaderboard/
│       │   │   └── websocket/
│       │   │       ├── websocket.module.ts
│       │   │       ├── websocket.gateway.ts
│       │   │       └── events/
│       │   ├── common/             # Shared utilities
│       │   │   ├── decorators/
│       │   │   ├── filters/
│       │   │   ├── guards/
│       │   │   ├── interceptors/
│       │   │   ├── pipes/
│       │   │   └── exceptions/
│       │   ├── config/             # Configuration
│       │   │   ├── database.config.ts
│       │   │   ├── redis.config.ts
│       │   │   └── s3.config.ts
│       │   └── workers/            # BullMQ job processors
│       │       ├── workers.module.ts
│       │       ├── build.processor.ts
│       │       └── evaluate.processor.ts
│       └── test/                   # API tests
│           ├── app.e2e-spec.ts
│           └── jest-e2e.json
├── packages/
│   └── shared/                     # Shared types and utilities
│       ├── src/
│       │   ├── types/              # TypeScript type definitions
│       │   │   ├── submission.ts
│       │   │   ├── test-case.ts
│       │   │   └── leaderboard.ts
│       │   └── utils/              # Shared utilities
│       │       └── scoring.ts
│       ├── prisma/
│       │   ├── schema.prisma       # Database schema
│       │   └── migrations/         # Migration files
│       └── package.json
├── scripts/
│   ├── docker/                     # Docker-related scripts
│   │   ├── run_test.sh             # Injected entrypoint
│   │   └── build.sh                # Build script
│   └── setup/                      # Setup scripts
├── docs/
│   └── implementation/             # Implementation docs
├── specification/                  # Original specs
└── tests/
    ├── unit/                       # Unit tests
    ├── integration/                # Integration tests
    └── e2e/                        # End-to-end tests
```

## Quick Start Commands

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Generate Prisma client
npx prisma generate --schema=packages/shared/prisma/schema.prisma

# Run migrations
npx prisma migrate dev --schema=packages/shared/prisma/schema.prisma

# Start development (both apps)
npm run dev

# Start API only
npm run dev:api

# Start Web only
npm run dev:web

# Run workers
npm run workers

# Run tests
npm run test
```

## Related Documents

- [Phase 1: Core Infrastructure](./01_PHASE_1_CORE.md)
- [Phase 2: Job Queue System](./02_PHASE_2_JOB_QUEUE.md)
- [Phase 3: Security Hardening](./03_PHASE_3_SECURITY.md)
- [Phase 4: Dashboard & Real-time](./04_PHASE_4_FRONTEND.md)
- [Phase 5: Testing & Polish](./05_PHASE_5_TESTING.md)
- [Database Schema](./DATABASE_SCHEMA.md)
- [API Reference](./API_REFERENCE.md)
- [Docker Execution](./DOCKER_EXECUTION.md)
