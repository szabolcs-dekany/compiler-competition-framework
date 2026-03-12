# Programming Language Evaluation Framework
## Technical Specification Document

**Version 1.0 | Competition Infrastructure Design**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Test Case Specification Format](#3-test-case-specification-format)
4. [Team Submission Format](#4-team-submission-format)
5. [Runtime Entrypoint Design](#5-runtime-entrypoint-design)
6. [Database Schema Design](#6-database-schema-design)
7. [Evaluation Pipeline](#7-evaluation-pipeline)
8. [Security Configuration](#8-security-configuration)
9. [API Endpoints Specification](#9-api-endpoints-specification)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Executive Summary

This document provides a comprehensive technical specification for a programming language evaluation framework designed for competitive programming contests. The framework enables teams to submit custom compilers that produce native machine code, with automated testing infrastructure to evaluate correctness, performance, and adherence to language design requirements.

The system is architected around Docker containerization for secure isolation, with a distributed job queue system for scalable test execution. Teams submit their compiler once, along with source files for each test case, and the framework handles the complete evaluation pipeline from compilation through runtime testing and scoring.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Entrypoint Strategy** | Runtime injection via `--entrypoint` flag | Maximum flexibility; teams focus on Dockerfile setup |
| **Submission Model** | Single compiler upload, source file per test | Cleaner separation, independent test evaluation |
| **Correctness Criteria** | Exact string match for stdout + exact exit code | Deterministic, unambiguous scoring |
| **Scoring Model** | Pass/fail + 20% performance bonus | Prioritizes correctness while incentivizing optimization |

---

## 2. System Architecture

### 2.1 Architecture Overview

The evaluation framework follows a layered architecture pattern, separating concerns between presentation, API processing, job orchestration, and container execution. This design ensures scalability, maintainability, and security while providing real-time feedback to competition participants.

| Layer | Components & Technologies |
|-------|---------------------------|
| **Presentation** | Next.js 16 + TypeScript + Tailwind CSS + shadcn/ui Dashboard |
| **API Layer** | Next.js API Routes, Socket.io WebSocket for real-time updates |
| **Job Queue** | Redis + BullMQ for async job processing, retry logic, and progress tracking |
| **Worker Layer** | Node.js workers using Docker Engine SDK for container orchestration |
| **Data Layer** | PostgreSQL (Prisma ORM), Redis (caching/pub-sub), S3/MinIO (artifacts) |

### 2.2 Technology Stack Rationale

The technology choices are driven by the unique requirements of executing untrusted code in a competitive environment. TypeScript provides type safety across the full stack, while Docker offers the gold standard for process isolation. Redis and BullMQ deliver battle-tested job queue capabilities with excellent monitoring interfaces.

1. **TypeScript/Node.js:** Excellent Docker SDK support, native async I/O for concurrent container management, unified language across frontend and backend reduces context switching and enables code sharing.

2. **Docker Engine SDK:** Programmatic container lifecycle management, fine-grained control over resource limits and security options, industry-standard isolation technology.

3. **Redis + BullMQ:** High-performance job queuing with built-in retry mechanisms, priority support for urgent evaluations, and real-time progress tracking through job events.

4. **PostgreSQL + Prisma:** Type-safe database access with migrations, relational model fits the hierarchical data (teams, submissions, test runs), and Prisma Client enables rapid development.

### 2.3 System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│  Next.js 16 + TypeScript + Tailwind + shadcn/ui Dashboard   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API LAYER                               │
│  Next.js API Routes / or separate Express/Fastify service   │
│  - Submission endpoints                                      │
│  - Real-time status via WebSockets (Socket.io)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    JOB QUEUE LAYER                           │
│  Redis + BullMQ (Node.js) or Celery (Python)               │
│  - Handles async test execution                              │
│  - Retry logic, priority queuing                            │
│  - Progress tracking                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   WORKER LAYER                               │
│  Node.js/Python workers that:                               │
│  1. Extract submissions                                      │
│  2. Build Docker images (docker SDK)                        │
│  3. Execute containers with security constraints            │
│  4. Capture output & compare with expected                  │
│  5. Report results back                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                │
│  PostgreSQL: Teams, Submissions, Results, Test Cases        │
│  Redis: Job queues, caching, real-time pub/sub              │
│  S3/MinIO: Submission artifacts storage                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Test Case Specification Format

### 3.1 Test Case Definition Schema

Each test case is defined in a structured YAML format that specifies the evaluation criteria, expected behavior, and runtime parameters. This declarative approach allows test cases to be version-controlled, validated, and processed programmatically by the evaluation engine.

**Test Case Structure:**

```yaml
test_cases:
  - id: "TC001"
    category: "arithmetic"
    name: "Integer Addition"
    description: "Add two positive integers and print result"
    difficulty: 1  # 1=easy, 2=medium, 3=hard
    source_file: "add_integers.lang"
    expected_stdout: "42"
    expected_exit_code: 0
    args: []
    stdin: null
    timeout_ms: 5000
    max_memory_mb: 256
    points: 10
    performance_bonus: true
    performance_threshold_ms: 100
```

### 3.2 Test Case Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., "TC001") |
| `category` | string | Test category for grouping (arithmetic, control_flow, etc.) |
| `name` | string | Human-readable test name |
| `description` | string | Detailed description of what is being tested |
| `difficulty` | integer | Difficulty level: 1=easy, 2=medium, 3=hard |
| `source_file` | string | Filename of the source code for this test |
| `expected_stdout` | string | Exact expected output to stdout |
| `expected_exit_code` | integer | Expected program exit code (typically 0) |
| `args` | array | Command-line arguments to pass to executable |
| `stdin` | string? | Input to provide via stdin (null if none) |
| `timeout_ms` | integer | Maximum execution time in milliseconds |
| `max_memory_mb` | integer | Maximum memory allocation in megabytes |
| `points` | integer | Points awarded for passing this test |
| `performance_bonus` | boolean | Whether performance bonus applies |
| `performance_threshold_ms` | integer | Threshold for performance bonus (ms) |

### 3.3 Multi-Line Output Handling

For tests expecting multi-line output, use the pipe operator for YAML multi-line strings:

```yaml
expected_stdout: |
  Line 1
  Line 2
  Line 3
```

### 3.4 stdin Input Specification

For tests requiring user input, specify the stdin content:

```yaml
stdin: |
  5
  10
  hello world
```

---

## 4. Team Submission Format

### 4.1 Submission Package Structure

Teams submit their work as a structured archive containing the compiler implementation, Docker configuration, and source files for each test case. The compiler is uploaded once and shared across all test executions, while source files are provided separately for each test case.

**Required Package Structure:**

```
submission/
├── compiler/
│   ├── src/           # Compiler source code
│   ├── bin/           # Compiled compiler binary
│   └── lib/           # Required libraries/dependencies
├── Dockerfile         # Docker build instructions
├── compile.sh         # Compilation script (called by framework)
└── sources/
    ├── TC001_add_integers.lang
    ├── TC002_subtract_integers.lang
    └── ...              # One source file per test case
```

### 4.2 Dockerfile Requirements

The Dockerfile defines the build environment for the compiler. It must establish a complete toolchain capable of compiling source files to native machine code. The framework will inject the evaluation entrypoint at runtime, so teams should focus solely on setting up their compilation environment.

**Example Dockerfile:**

```dockerfile
FROM ubuntu:22.04

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    nasm \
    llvm \
    && rm -rf /var/lib/apt/lists/*

# Copy compiler files
COPY compiler/ /compiler/

# Build the compiler if needed
RUN cd /compiler && make

WORKDIR /workspace
```

### 4.3 Compilation Script Contract

The `compile.sh` script serves as the interface between the framework and the team's compiler. It must accept a source file path and output binary path as arguments, returning appropriate exit codes for success or failure.

**Script Interface Contract:**

| Aspect | Specification |
|--------|---------------|
| **Arguments** | `$1` = source file path, `$2` = output binary path |
| **Exit Code 0** | Compilation successful, binary created at specified path |
| **Exit Code 1** | Compilation failed (syntax error, type error, etc.) |
| **Exit Code 2** | Internal compiler error |
| **Stderr** | Error messages for debugging (captured and logged) |

**Example compile.sh:**

```bash
#!/bin/bash
SOURCE_FILE="$1"
OUTPUT_BIN="$2"

# Invoke the compiler
/compiler/bin/mycompiler "$SOURCE_FILE" -o "$OUTPUT_BIN"
exit $?
```

### 4.4 Source File Naming Convention

Source files must follow the naming convention: `{TEST_ID}_{test_name}.lang`

Examples:
- `TC001_add_integers.lang`
- `TC027_recursive_function.lang`
- `TC050_struct_definition.lang`

The file extension (`.lang`) can be customized per team but must be consistent across all source files.

---

## 5. Runtime Entrypoint Design

### 5.1 Injected Entrypoint Strategy

The framework injects a custom entrypoint script at container runtime using Docker's `--entrypoint` flag. This approach provides maximum flexibility: teams can focus on their Dockerfile setup without worrying about the evaluation interface, while the framework maintains complete control over the execution flow.

**Injected Entrypoint Script (run_test.sh):**

```bash
#!/bin/bash
# Framework-injected evaluation entrypoint

SOURCE_FILE="$1"
OUTPUT_BIN="/workspace/output"
shift
ARGS="$@"

# Phase 1: Compilation
echo "=== COMPILATION PHASE ==="
/compiler/compile.sh "$SOURCE_FILE" "$OUTPUT_BIN"
COMPILE_EXIT=$?

if [ $COMPILE_EXIT -ne 0 ]; then
    echo "COMPILATION_FAILED:$COMPILE_EXIT"
    exit 100  # Special code for compilation failure
fi

# Phase 2: Execution
echo "=== EXECUTION PHASE ==="
chmod +x "$OUTPUT_BIN"
exec "$OUTPUT_BIN" $ARGS
```

### 5.2 Docker Execution Command

The worker executes the container with carefully constructed arguments, including the injected entrypoint, resource limits, and security constraints. This command represents the core execution pattern used for every test evaluation.

**Container Execution Command:**

```bash
docker run --rm \
  --entrypoint "/scripts/run_test.sh" \
  --network none \
  --cpus="1" \
  --memory="256m" \
  --pids-limit 100 \
  --security-opt=no-new-privileges \
  --read-only \
  --tmpfs /tmp:size=10m \
  -v "$SOURCE_PATH:/workspace/source.lang:ro" \
  -v "$SCRIPTS_DIR:/scripts:ro" \
  team-compiler-$SUBMISSION_ID /workspace/source.lang $ARGS
```

### 5.3 Output Capture and Exit Code Mapping

The framework captures stdout, stderr, and the exit code from each container execution:

| Container Exit Code | Framework Status | Description |
|---------------------|------------------|-------------|
| 0 | PASSED | Program executed successfully |
| 100 | COMPILATION_FAILED | Compiler returned non-zero exit code |
| 137 | TIMEOUT | Container killed due to timeout |
| 139 | RUNTIME_ERROR | Segmentation fault |
| Other | FAILED | Program exited with error code |

### 5.4 Timeout Enforcement

Two layers of timeout enforcement ensure no test runs indefinitely:

1. **Container-level timeout:** Docker's `--timeout` flag kills the container after the specified duration
2. **Process-level timeout:** The entrypoint script wraps execution with the `timeout` command

```bash
# In run_test.sh
timeout ${TIMEOUT_SECONDS}s "$OUTPUT_BIN" $ARGS
```

---

## 6. Database Schema Design

### 6.1 Entity Relationship Model

The database schema follows a hierarchical model centered around teams, their submissions, and the individual test run results. This structure supports historical tracking, real-time leaderboards, and detailed performance analytics.

### 6.2 Prisma Schema Definition

```prisma
model Team {
  id          String   @id @default(cuid())
  name        String   @unique
  email       String   @unique
  createdAt   DateTime @default(now())
  submissions Submission[]
}

model Submission {
  id            String     @id @default(cuid())
  teamId        String
  team          Team       @relation(fields: [teamId], references: [id])
  version       Int        @default(1)
  compilerPath  String     // S3 path to compiler archive
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

### 6.3 Entity Relationships

```
┌─────────┐       ┌─────────────┐       ┌──────────┐
│  Team   │───1:N─│  Submission │───1:N─│ TestRun  │
└─────────┘       └─────────────┘       └──────────┘
                                               │
                                               │ N:1
                                               ▼
                                         ┌──────────┐
                                         │ TestCase │
                                         └──────────┘
```

### 6.4 Key Indexes

For optimal query performance, the following indexes should be created:

```sql
-- Leaderboard queries
CREATE INDEX idx_submission_total_score ON Submission(total_score DESC);
CREATE INDEX idx_submission_team ON Submission(team_id);

-- Test run lookups
CREATE INDEX idx_testrun_submission ON TestRun(submission_id);
CREATE INDEX idx_testrun_testcase ON TestRun(test_case_id);
CREATE INDEX idx_testrun_status ON TestRun(status);

-- Team lookups
CREATE UNIQUE INDEX idx_team_name ON Team(name);
CREATE UNIQUE INDEX idx_team_email ON Team(email);
```

---

## 7. Evaluation Pipeline

### 7.1 Complete Evaluation Flow

The evaluation pipeline orchestrates the complete lifecycle of a submission, from initial upload through final scoring. Each phase is designed to be idempotent and recoverable, allowing for graceful handling of failures and retries.

**Phase Breakdown:**

1. **Submission Ingestion:** Receive team archive, validate structure, extract to temporary storage, upload compiler artifacts to object storage (S3/MinIO), create database records with PENDING status.

2. **Docker Image Build:** Pull base image if needed, execute Dockerfile instructions, tag with unique submission ID, push to private registry. Failures here result in BUILD_FAILED status with build logs captured.

3. **Test Job Creation:** For each test case, create a BullMQ job with the submission ID, test case ID, and source file path. Jobs are prioritized by test case difficulty (harder tests first for early feedback).

4. **Worker Execution:** Worker picks up job, prepares source file, constructs Docker run command with security constraints, executes container with timeout enforcement, captures stdout/stderr/exit codes.

5. **Result Processing:** Compare actual output with expected (exact string match), calculate points earned, apply performance bonus if applicable, update TestRun record with all metrics and results.

6. **Score Aggregation:** After all test runs complete for a submission, aggregate total points, calculate ranking position, trigger WebSocket notification to team dashboard with final results.

### 7.2 Scoring Algorithm

The scoring system balances correctness with performance incentives. Points are awarded for passing tests, with additional bonus points for efficient execution. The algorithm ensures that correctness is always prioritized over speed.

**Scoring Formula:**

```
total_points = base_points + performance_bonus

WHERE:
  base_points = test.points IF output == expected AND exit_code == 0
  base_points = 0 IF compilation_failed OR runtime_error OR output_mismatch
  performance_bonus = floor(points * 0.2) IF run_time < threshold
  performance_bonus = 0 OTHERWISE
```

### 7.3 Output Comparison Logic

The framework performs exact string matching for output comparison:

```javascript
function compareOutput(actual: string, expected: string): boolean {
  // Normalize line endings
  const normalizedActual = actual.replace(/\r\n/g, '\n').trim();
  const normalizedExpected = expected.replace(/\r\n/g, '\n').trim();
  
  return normalizedActual === normalizedExpected;
}
```

### 7.4 Performance Bonus Calculation

Performance bonuses are calculated based on execution time relative to the threshold:

```javascript
function calculateBonus(
  points: number, 
  runTimeMs: number, 
  thresholdMs: number,
  hasBonus: boolean
): number {
  if (!hasBonus) return 0;
  if (runTimeMs >= thresholdMs) return 0;
  
  // 20% bonus if under threshold
  return Math.floor(points * 0.2);
}
```

### 7.5 Job Queue Configuration

BullMQ job queue settings for optimal throughput:

```javascript
const queueConfig = {
  defaultJobOptions: {
    attempts: 2,              // Retry once on failure
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: 100,    // Keep last 100 completed jobs
    removeOnFail: 500         // Keep last 500 failed jobs
  }
};
```

---

## 8. Security Configuration

### 8.1 Container Security Hardening

Executing untrusted code requires a defense-in-depth approach. The framework implements multiple layers of security isolation, from Docker container options to kernel-level protections. Each layer addresses specific attack vectors while maintaining evaluation accuracy.

### 8.2 Security Threat Mitigation Matrix

| Threat Vector | Mitigation | Implementation |
|---------------|------------|----------------|
| Container Escape | Runtime Isolation | gVisor or Kata Containers for VM-level isolation |
| Privilege Escalation | Capability Dropping | `--security-opt=no-new-privileges --cap-drop=ALL` |
| Network Exfiltration | Network Isolation | `--network none` (no external access) |
| Resource Exhaustion | Resource Limits | `--cpus`, `--memory`, `--pids-limit` |
| Disk Fill Attack | Storage Quotas | `--read-only` with tmpfs for `/tmp` |
| Fork Bomb | Process Limits | `--pids-limit 100` |
| Infinite Loop | Timeout Enforcement | `timeout` command wrapper + container kill |

### 8.3 Complete Docker Security Options

```bash
docker run --rm \
  --network none \                      # No network access
  --cpus="1" \                          # Limit to 1 CPU
  --memory="256m" \                     # Memory limit
  --memory-swap="256m" \                # Disable swap
  --pids-limit 100 \                    # Process limit
  --security-opt=no-new-privileges \    # Prevent privilege escalation
  --cap-drop=ALL \                      # Drop all capabilities
  --read-only \                         # Read-only filesystem
  --tmpfs /tmp:size=10m,mode=1777 \     # Temporary filesystem
  --ulimit nofile=64:64 \               # File descriptor limit
  --ulimit nproc=50:50 \                # Process count limit
  team-compiler-$ID
```

### 8.4 Runtime Isolation Options

For enhanced security, consider one of these runtime isolation technologies:

**Option A: gVisor (runsc)**

```bash
docker run --runtime=runsc ...
```

Provides a userspace kernel that intercepts syscalls, adding an additional isolation layer without full VM overhead.

**Option B: Kata Containers**

```bash
docker run --runtime=kata-runtime ...
```

Runs each container in a lightweight VM, providing hardware-level isolation.

### 8.5 Host Security Requirements

The host system running the workers should be hardened:

1. **Kernel Security:** Enable SELinux/AppArmor, configure seccomp profiles
2. **User Namespaces:** Enable Docker user namespaces for UID remapping
3. **Network Isolation:** Run workers on isolated network segment
4. **Resource Monitoring:** Monitor for abnormal resource consumption patterns
5. **Regular Updates:** Keep Docker and host kernel updated

---

## 9. API Endpoints Specification

### 9.1 REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/teams` | Register new team |
| `POST` | `/api/submissions` | Submit compiler and source files |
| `GET` | `/api/submissions/:id` | Get submission status and results |
| `GET` | `/api/submissions/:id/runs` | Get all test runs for a submission |
| `GET` | `/api/leaderboard` | Get current competition standings |
| `GET` | `/api/test-cases` | List all test case specifications |
| `GET` | `/api/test-cases/:id` | Get specific test case details |

### 9.2 WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `submission:progress` | Server → Client | Test run progress updates |
| `submission:complete` | Server → Client | All tests completed |
| `testrun:start` | Server → Client | Individual test started |
| `testrun:complete` | Server → Client | Individual test completed |
| `leaderboard:update` | Server → Client | Leaderboard position changed |

### 9.3 API Request/Response Examples

**Team Registration:**

```http
POST /api/teams
Content-Type: application/json

{
  "name": "Compiler Crusaders",
  "email": "team@example.com"
}

Response 201:
{
  "id": "clx123abc",
  "name": "Compiler Crusaders",
  "email": "team@example.com",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

**Submission Upload:**

```http
POST /api/submissions
Content-Type: multipart/form-data

- compiler: (archive file)
- sources: (multiple source files)

Response 202:
{
  "id": "clx456def",
  "teamId": "clx123abc",
  "status": "PENDING",
  "submittedAt": "2025-01-15T11:00:00Z"
}
```

**Get Submission Status:**

```http
GET /api/submissions/clx456def

Response 200:
{
  "id": "clx456def",
  "status": "COMPLETED",
  "totalScore": 450,
  "testsPassed": 42,
  "testsFailed": 6,
  "testRuns": [
    {
      "testCaseId": "TC001",
      "status": "PASSED",
      "pointsEarned": 10,
      "bonusEarned": 2,
      "runTimeMs": 45
    },
    // ...
  ]
}
```

### 9.4 WebSocket Connection

```javascript
// Client connection
const socket = io('/ws/submission/clx456def');

// Listen for events
socket.on('testrun:complete', (data) => {
  console.log(`Test ${data.testCaseId}: ${data.status}`);
});

socket.on('submission:complete', (data) => {
  console.log(`Final score: ${data.totalScore}`);
});
```

---

## 10. Implementation Roadmap

### 10.1 Development Phases

The implementation should follow an incremental approach, starting with a minimal viable evaluation system and progressively adding features. This approach allows for early testing and validation of core assumptions while managing development complexity.

**Phase 1 - Core Infrastructure (Week 1-2):**
- Database schema setup with Prisma migrations
- Basic API endpoints for teams and submissions
- Docker worker skeleton with single test execution
- File upload handling and validation

**Phase 2 - Job Queue System (Week 3):**
- Redis integration for job queue
- BullMQ job processing implementation
- Parallel test execution across multiple workers
- Retry mechanisms and error handling

**Phase 3 - Security Hardening (Week 4):**
- Container security policies implementation
- Resource limits and timeout enforcement
- Network isolation configuration
- Security testing and penetration testing

**Phase 4 - Dashboard & Real-time (Week 5):**
- Frontend dashboard with Next.js
- WebSocket integration for real-time updates
- Leaderboard system with rankings
- Result visualization and charts

**Phase 5 - Testing & Polish (Week 6):**
- End-to-end testing of complete flow
- Performance optimization
- Documentation completion
- Deployment preparation

### 10.2 Key Technical Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Entrypoint Strategy** | Runtime injection via `--entrypoint` flag | Maximum flexibility for teams |
| **Submission Model** | Single compiler, source file per test | Cleaner separation and debugging |
| **Correctness Criteria** | Exact string match | Deterministic evaluation |
| **Scoring Model** | Pass/fail + 20% performance bonus | Balance correctness and efficiency |
| **Security Approach** | Defense-in-depth with Docker options | Multiple layers of protection |
| **Job Queue** | BullMQ + Redis | Battle-tested, excellent monitoring |
| **Database** | PostgreSQL + Prisma | Type-safe, relational model fit |

### 10.3 Deployment Architecture

```
                    ┌─────────────┐
                    │   CDN/WAF   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Gateway   │
                    │   (Caddy)   │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
   ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
   │  Next.js  │    │  Worker   │    │  Redis    │
   │  (Web)    │    │  Node 1   │    │  Cluster  │
   └───────────┘    └───────────┘    └───────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                    ┌──────▼──────┐
                    │ PostgreSQL  │
                    │  (Primary)  │
                    └─────────────┘
```

### 10.4 Monitoring and Observability

Key metrics to track:

- **Queue Metrics:** Job throughput, queue depth, processing time
- **Container Metrics:** Build time, execution time, resource usage
- **System Metrics:** CPU, memory, disk I/O across workers
- **Business Metrics:** Submissions per hour, test success rate

Recommended tools:
- **Prometheus + Grafana:** Metrics collection and visualization
- **Structured Logging:** JSON logs with correlation IDs
- **Error Tracking:** Sentry for error aggregation
- **APM:** DataDog or New Relic for distributed tracing
