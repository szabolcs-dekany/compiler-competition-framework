# Evaluator API

Backend service for the Programming Language Evaluation Framework - a competitive programming contest system where teams submit custom compilers that produce native machine code.

## Tech Stack

- **Framework**: NestJS 11 with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Storage**: S3-compatible (Garage/MinIO)
- **Job Queue**: Redis + BullMQ
- **API Documentation**: Swagger/OpenAPI

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Engine with Docker Compose
- Repository dependencies installed from the monorepo root
- Shared package built before starting the API

## Getting Started

### 1. Install Dependencies

From the repository root:

```bash
npm install
```

### 2. Configure Environment

```bash
cp evaluator-api/.env.example evaluator-api/.env
```

The default values match the local Docker Compose services defined in the repository root. Edit `evaluator-api/.env` only if you need non-default ports, credentials, or a different Docker socket.

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/evaluator?schema=public` |
| `REDIS_HOST` | Redis hostname | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `S3_ENDPOINT` | S3 endpoint URL | `http://localhost:9000` |
| `S3_ACCESS_KEY` | S3 access key | `GK00000000deadbeefcafe0001` |
| `S3_SECRET_KEY` | S3 secret key | `a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456` |
| `S3_BUCKET` | S3 bucket name | `evaluator-artifacts` |
| `S3_REGION` | S3 region | `garage` |
| `TEST_CASES_DIR` | Test cases directory | `test-cases` |
| `DOCKER_SOCKET_PATH` | Docker socket path | `/var/run/docker.sock` |

### 3. Start Local Infrastructure

From the repository root:

```bash
docker-compose up -d
```

This provides PostgreSQL, Redis, and Garage for local development.

### 4. Build Shared Types

The API imports `@evaluator/shared`, so build it before starting the server:

```bash
npm run build --workspace shared
```

Use watch mode instead if you are actively editing shared types:

```bash
npm run dev --workspace shared
```

### 5. Setup Database

```bash
npx prisma generate --schema evaluator-api/prisma/schema.prisma
npx prisma migrate dev --schema evaluator-api/prisma/schema.prisma
```

### 6. Start the Server

```bash
# Development (with watch mode)
npm run start:dev --workspace evaluator-api

# Production
npm run build --workspace evaluator-api
npm run start:prod --workspace evaluator-api
```

The API runs on `http://localhost:3000` by default with the `/api` global prefix.
Swagger UI is available at `http://localhost:3000/docs`.
On startup, the application checks for the configured S3 bucket and creates it automatically when missing.

## API Documentation

Swagger UI is available at `http://localhost:3000/docs`

## Project Structure

```
src/
├── modules/
│   ├── teams/           # Team management
│   ├── test-cases/      # Test case definitions
│   ├── source-files/    # Source file uploads & versioning
│   └── submissions/     # Submission handling
├── common/
│   ├── prisma/          # Prisma client
│   ├── storage/         # S3 storage service
│   ├── decorators/      # Custom decorators
│   └── filters/         # Exception filters
├── config/              # Configuration modules
├── workers/             # BullMQ job processors
├── app.module.ts
└── main.ts
prisma/
├── schema.prisma        # Database schema
└── migrations/          # Migration files
test-cases/              # YAML test case definitions
test/                    # E2E tests
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev --workspace evaluator-api` | Start dev server with hot reload |
| `npm run build --workspace evaluator-api` | Build for production |
| `npm run start:prod --workspace evaluator-api` | Run production build |
| `npm run lint --workspace evaluator-api` | Run ESLint with auto-fix |
| `npm run test --workspace evaluator-api` | Run unit tests |
| `npm run test:watch --workspace evaluator-api` | Run tests in watch mode |
| `npm run test:cov --workspace evaluator-api` | Run tests with coverage |
| `npm run test:e2e --workspace evaluator-api` | Run end-to-end tests |

### Running Single Tests

```bash
# By file pattern
npm run test --workspace evaluator-api -- --testPathPattern="teams.controller"

# By test name
npm run test --workspace evaluator-api -- --testNamePattern="should create a team"

# Single e2e test
npm run test:e2e --workspace evaluator-api -- --testPathPattern="app"
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| **Teams** |||
| `GET` | `/api/teams` | List all teams |
| `POST` | `/api/teams` | Create a team |
| `GET` | `/api/teams/:id` | Get team by ID |
| `DELETE` | `/api/teams/:id` | Delete a team |
| **Test Cases** |||
| `GET` | `/api/test-cases` | List all test case blueprints |
| `GET` | `/api/test-cases/:id` | Get test case blueprint |
| **Source Files** |||
| `GET` | `/api/source-files?teamId=xxx` | List team's source files |
| `POST` | `/api/source-files` | Upload source file |
| `GET` | `/api/source-files/:id` | Get source file metadata |
| `GET` | `/api/source-files/:id/versions` | Get version history |
| `GET` | `/api/source-files/:id/download` | Download latest version |
| `GET` | `/api/source-files/:id/versions/:version/download` | Download specific version |
| `PUT` | `/api/source-files/:id` | Replace source file |
| **Submissions** |||
| `GET` | `/api/submissions` | List all submissions |
| `POST` | `/api/submissions` | Create submission |
| `GET` | `/api/submissions/:id` | Get submission details |
| `GET` | `/api/submissions/team/:teamId` | List team's submissions |
| `GET` | `/api/submissions/:id/test-runs` | Get test run results |

## Test Cases

Test cases are defined as YAML files in `test-cases/`:

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

## Database Management

```bash
# Generate Prisma client after schema changes
npx prisma generate --schema evaluator-api/prisma/schema.prisma

# Create and apply migration
npx prisma migrate dev --schema evaluator-api/prisma/schema.prisma --name description

# Reset database (warning: deletes all data)
npx prisma migrate reset --schema evaluator-api/prisma/schema.prisma

# Open Prisma Studio (database GUI)
npx prisma studio --schema evaluator-api/prisma/schema.prisma
```

## Development with Docker

From the repository root, start the infrastructure:

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- Garage (S3) on port 9000
- Garage WebUI on port 3909

## License

UNLICENSED - Private project
