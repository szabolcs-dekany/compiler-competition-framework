# API Reference

## Base URL

```
Development: http://localhost:3001/api
Production: https://api.your-domain.com/api
```

## Authentication

Currently no authentication required. For production, implement API keys or JWT tokens via NestJS guards.

---

## Teams

### Register Team

```http
POST /api/teams
Content-Type: application/json

{
  "name": "Compiler Crusaders",
  "email": "team@example.com"
}
```

**Response 201:**
```json
{
  "id": "clx123abc",
  "name": "Compiler Crusaders",
  "email": "team@example.com",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

**Errors:**
- `409 Conflict` - Team name or email already exists
- `400 Bad Request` - Invalid input data

### Get Team

```http
GET /api/teams/:id
```

**Response 200:**
```json
{
  "id": "clx123abc",
  "name": "Compiler Crusaders",
  "email": "team@example.com",
  "createdAt": "2025-01-15T10:30:00Z",
  "submissions": [
    {
      "id": "clx456def",
      "status": "COMPLETED",
      "totalScore": 450,
      "submittedAt": "2025-01-15T11:00:00Z"
    }
  ]
}
```

---

## Submissions

### Create Submission

```http
POST /api/submissions
Content-Type: multipart/form-data

teamId: clx123abc
compiler: (binary file - .tar.gz or .zip)
sources: (multiple .lang files)
```

**Response 202:**
```json
{
  "id": "clx456def",
  "teamId": "clx123abc",
  "status": "PENDING",
  "submittedAt": "2025-01-15T11:00:00Z"
}
```

**Errors:**
- `400 Bad Request` - Missing required files or invalid format
- `404 Not Found` - Team not found

### Get Submission

```http
GET /api/submissions/:id
```

**Response 200:**
```json
{
  "id": "clx456def",
  "teamId": "clx123abc",
  "status": "COMPLETED",
  "totalScore": 450,
  "submittedAt": "2025-01-15T11:00:00Z",
  "testsPassed": 42,
  "testsFailed": 6,
  "testsTotal": 48
}
```

### Get Submission Test Runs

```http
GET /api/submissions/:id/runs
```

**Response 200:**
```json
{
  "runs": [
    {
      "id": "clx789ghi",
      "testCaseId": "TC001",
      "testCase": {
        "name": "Integer Addition",
        "category": "arithmetic"
      },
      "status": "PASSED",
      "compileTimeMs": 150,
      "runTimeMs": 45,
      "pointsEarned": 10,
      "bonusEarned": 2
    }
  ]
}
```

### Get Test Run Details

```http
GET /api/submissions/:id/runs/:testRunId
```

**Response 200:**
```json
{
  "id": "clx789ghi",
  "testCaseId": "TC001",
  "status": "PASSED",
  "compileSuccess": true,
  "compileTimeMs": 150,
  "runSuccess": true,
  "runTimeMs": 45,
  "actualStdout": "42",
  "actualStderr": "",
  "exitCode": 0,
  "pointsEarned": 10,
  "bonusEarned": 2
}
```

---

## Test Cases

### List Test Cases

```http
GET /api/test-cases
```

**Query Parameters:**
- `category` - Filter by category
- `difficulty` - Filter by difficulty (1, 2, 3)

**Response 200:**
```json
{
  "testCases": [
    {
      "id": "TC001",
      "category": "arithmetic",
      "name": "Integer Addition",
      "difficulty": 1,
      "points": 10
    }
  ],
  "total": 48
}
```

### Get Test Case

```http
GET /api/test-cases/:id
```

**Response 200:**
```json
{
  "id": "TC001",
  "category": "arithmetic",
  "name": "Integer Addition",
  "description": "Add two positive integers and print result",
  "difficulty": 1,
  "timeoutMs": 5000,
  "maxMemoryMb": 256,
  "points": 10,
  "performanceBonus": true,
  "perfThresholdMs": 100
}
```

---

## Leaderboard

### Get Leaderboard

```http
GET /api/leaderboard
```

**Query Parameters:**
- `limit` - Number of entries (default: 50)
- `offset` - Pagination offset

**Response 200:**
```json
{
  "entries": [
    {
      "rank": 1,
      "teamId": "clx123abc",
      "teamName": "Compiler Crusaders",
      "score": 850,
      "testsPassed": 45,
      "totalTests": 48,
      "submittedAt": "2025-01-15T11:00:00Z"
    }
  ],
  "total": 25
}
```

---

## WebSocket Events

### Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3001', {
  query: { submissionId: 'clx456def' }
});
```

### Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `testrun:start` | Server → Client | Test started |
| `testrun:progress` | Server → Client | Progress update |
| `testrun:complete` | Server → Client | Test finished |
| `submission:complete` | Server → Client | All tests done |
| `leaderboard:update` | Server → Client | Leaderboard changed |

### Event Payloads

#### testrun:start
```json
{
  "testCaseId": "TC001",
  "testCaseName": "Integer Addition"
}
```

#### testrun:progress
```json
{
  "testCaseId": "TC001",
  "phase": "compiling",
  "progress": 50
}
```

#### testrun:complete
```json
{
  "testCaseId": "TC001",
  "status": "PASSED",
  "pointsEarned": 10,
  "bonusEarned": 2,
  "runTimeMs": 45
}
```

#### submission:complete
```json
{
  "submissionId": "clx456def",
  "totalScore": 450,
  "testsPassed": 42,
  "testsFailed": 6
}
```

#### leaderboard:update
```json
{
  "teamId": "clx123abc",
  "teamName": "Compiler Crusaders",
  "newRank": 1,
  "previousRank": 2,
  "score": 850
}
```

### Subscribe to Leaderboard

```javascript
socket.emit('subscribe:leaderboard');
socket.on('leaderboard:update', (data) => {
  console.log('Leaderboard updated:', data);
});
```

---

## Error Responses

### Standard Error Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "name",
        "message": "Name is required"
      }
    ]
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| POST /api/submissions | 10/hour per team |
| GET /api/* | 100/minute per IP |
| WebSocket connections | 5 per team |

---

## TypeScript Types

```typescript
interface Team {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface Submission {
  id: string;
  teamId: string;
  status: SubmissionStatus;
  totalScore: number;
  submittedAt: string;
}

type SubmissionStatus = 
  | 'PENDING'
  | 'BUILDING'
  | 'READY'
  | 'EVALUATING'
  | 'COMPLETED'
  | 'FAILED';

interface TestCase {
  id: string;
  category: string;
  name: string;
  description: string;
  difficulty: 1 | 2 | 3;
  timeoutMs: number;
  maxMemoryMb: number;
  points: number;
  performanceBonus: boolean;
  perfThresholdMs?: number;
}

interface TestRun {
  id: string;
  submissionId: string;
  testCaseId: string;
  status: TestRunStatus;
  compileSuccess?: boolean;
  compileTimeMs?: number;
  runSuccess?: boolean;
  runTimeMs?: number;
  pointsEarned: number;
  bonusEarned: number;
}

type TestRunStatus =
  | 'PENDING'
  | 'COMPILING'
  | 'RUNNING'
  | 'PASSED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'ERROR';

interface LeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  score: number;
  testsPassed: number;
  totalTests: number;
  submittedAt: string;
}
```
