# Phase 5: Testing & Polish

**Duration: Week 6**

## Objectives

- Complete end-to-end testing
- Performance optimization
- Documentation completion
- Deployment preparation
- Final bug fixes and polish

---

## 5.1 Testing Strategy

### Test Pyramid

```
        ┌─────────┐
        │   E2E   │  (10%)
        │  Tests  │
        ├─────────┤
        │Integration│ (30%)
        │  Tests   │
        ├─────────┤
        │  Unit   │  (60%)
        │  Tests  │
        └─────────┘
```

### Test Categories

| Category | Focus | Tools |
|----------|-------|-------|
| Unit | Individual functions, services | Jest, Testing Library |
| Integration | API endpoints, database | Jest, Supertest |
| E2E | Full user flows | Playwright |
| Security | Container isolation, limits | Custom scripts |
| Performance | Load testing, benchmarks | k6, Artillery |

---

## 5.2 Unit Tests

### Tasks

- [ ] Test scoring service
- [ ] Test validation service
- [ ] Test output comparison
- [ ] Test error handling

### Example Unit Tests

```typescript
describe('Scoring Service', () => {
  describe('compareOutput', () => {
    it('should match identical outputs', () => {
      expect(compareOutput('42\n', '42')).toBe(true);
    });
    
    it('should normalize line endings', () => {
      expect(compareOutput('line1\r\nline2', 'line1\nline2')).toBe(true);
    });
    
    it('should trim whitespace', () => {
      expect(compareOutput('  42  ', '42')).toBe(true);
    });
    
    it('should fail on different outputs', () => {
      expect(compareOutput('42', '43')).toBe(false);
    });
  });
  
  describe('calculateBonus', () => {
    it('should return 20% bonus when under threshold', () => {
      expect(calculateBonus(10, 50, 100, true)).toBe(2);
    });
    
    it('should return 0 when over threshold', () => {
      expect(calculateBonus(10, 150, 100, true)).toBe(0);
    });
    
    it('should return 0 when bonus disabled', () => {
      expect(calculateBonus(10, 50, 100, false)).toBe(0);
    });
  });
});
```

### Files

```
tests/unit/services/scoring.test.ts
tests/unit/services/validation.test.ts
tests/unit/services/evaluator.test.ts
tests/unit/lib/errors.test.ts
```

---

## 5.3 Integration Tests

### Tasks

- [ ] Test API endpoints
- [ ] Test database operations
- [ ] Test job queue integration
- [ ] Test file storage

### API Integration Tests

```typescript
describe('Teams API', () => {
  it('should create a team', async () => {
    const response = await request(app)
      .post('/api/teams')
      .send({ name: 'Test Team', email: 'test@example.com' });
    
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.name).toBe('Test Team');
  });
  
  it('should reject duplicate team names', async () => {
    await createTeam({ name: 'Existing Team', email: 'existing@example.com' });
    
    const response = await request(app)
      .post('/api/teams')
      .send({ name: 'Existing Team', email: 'new@example.com' });
    
    expect(response.status).toBe(409);
  });
});

describe('Submissions API', () => {
  it('should upload and create submission', async () => {
    const team = await createTeam();
    const formData = createSubmissionFormData();
    
    const response = await request(app)
      .post('/api/submissions')
      .set('Content-Type', 'multipart/form-data')
      .field('teamId', team.id)
      .attach('compiler', 'tests/fixtures/valid-compiler.tar.gz')
      .attach('sources', 'tests/fixtures/TC001_add.lang');
    
    expect(response.status).toBe(202);
    expect(response.body.status).toBe('PENDING');
  });
});
```

### Files

```
tests/integration/api/teams.test.ts
tests/integration/api/submissions.test.ts
tests/integration/api/leaderboard.test.ts
tests/integration/workers/build.test.ts
tests/integration/workers/evaluate.test.ts
```

---

## 5.4 End-to-End Tests

### Tasks

- [ ] Set up Playwright
- [ ] Test complete submission flow
- [ ] Test leaderboard updates
- [ ] Test real-time notifications

### Playwright Configuration

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### E2E Test Examples

```typescript
test('complete submission flow', async ({ page }) => {
  await page.goto('/');
  
  await page.click('text=New Submission');
  
  await page.setInputFiles('input[type="file"]', 'tests/fixtures/valid-compiler.tar.gz');
  await page.setInputFiles('input[name="sources"]', 'tests/fixtures/TC001_add.lang');
  
  await page.click('button:has-text("Submit")');
  
  await expect(page.locator('[data-testid="submission-status"]')).toHaveText('BUILDING', { timeout: 30000 });
  
  await expect(page.locator('[data-testid="submission-status"]')).toHaveText('EVALUATING', { timeout: 60000 });
  
  await expect(page.locator('[data-testid="submission-status"]')).toHaveText('COMPLETED', { timeout: 120000 });
  
  await expect(page.locator('[data-testid="total-score"]')).toBeVisible();
});

test('leaderboard updates in real-time', async ({ page, browser }) => {
  await page.goto('/leaderboard');
  
  const initialScore = await page.locator('[data-testid="team-score"]').first().textContent();
  
  const otherPage = await browser.newPage();
  await submitNewSubmission(otherPage);
  
  await page.waitForFunction(
    (initial) => {
      const current = document.querySelector('[data-testid="team-score"]')?.textContent;
      return current !== initial;
    },
    initialScore,
    { timeout: 60000 }
  );
});
```

### Files

```
playwright.config.ts
tests/e2e/submission.spec.ts
tests/e2e/leaderboard.spec.ts
tests/e2e/dashboard.spec.ts
```

---

## 5.5 Performance Testing

### Tasks

- [ ] Set up load testing tool
- [ ] Test concurrent submissions
- [ ] Test worker throughput
- [ ] Identify bottlenecks

### k6 Load Test

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  const response = http.get('http://localhost:3000/api/leaderboard');
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
  
  sleep(1);
}
```

### Performance Benchmarks

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API Response Time | < 100ms | > 500ms |
| WebSocket Latency | < 50ms | > 200ms |
| Worker Throughput | 10 tests/sec | < 5 tests/sec |
| Database Query Time | < 50ms | > 200ms |
| Memory Usage | < 500MB/worker | > 1GB |

### Files

```
tests/performance/load-test.js
tests/performance/benchmarks.test.ts
```

---

## 5.6 Optimization

### Tasks

- [ ] Profile application performance
- [ ] Optimize database queries
- [ ] Implement caching
- [ ] Optimize frontend bundle

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_submission_score ON Submission(total_score DESC);
CREATE INDEX CONCURRENTLY idx_testrun_status ON TestRun(status);
CREATE INDEX CONCURRENTLY idx_testrun_submission_testcase ON TestRun(submission_id, test_case_id);
```

### Caching Strategy

```typescript
const CACHE_TTL = {
  leaderboard: 30,      // 30 seconds
  testCase: 300,        // 5 minutes
  teamSubmissions: 60,  // 1 minute
};

async function getLeaderboardCached(): Promise<LeaderboardEntry[]> {
  const cached = await redis.get('leaderboard');
  if (cached) return JSON.parse(cached);
  
  const data = await calculateLeaderboard();
  await redis.setex('leaderboard', CACHE_TTL.leaderboard, JSON.stringify(data));
  return data;
}
```

### Frontend Optimization

```typescript
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: ['recharts', 'lucide-react'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};
```

---

## 5.7 Documentation

### Tasks

- [ ] Write API documentation
- [ ] Write deployment guide
- [ ] Write contributor guide
- [ ] Document environment variables

### Documentation Structure

```
docs/
├── api/
│   ├── README.md
│   ├── authentication.md
│   ├── endpoints.md
│   └── websockets.md
├── deployment/
│   ├── README.md
│   ├── docker.md
│   ├── kubernetes.md
│   └── monitoring.md
├── development/
│   ├── README.md
│   ├── setup.md
│   ├── testing.md
│   └── contributing.md
└── architecture/
    ├── README.md
    ├── database.md
    └── security.md
```

---

## 5.8 Deployment Preparation

### Tasks

- [ ] Create Dockerfile for app
- [ ] Create docker-compose for development
- [ ] Create Kubernetes manifests
- [ ] Set up CI/CD pipeline

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://user:pass@db:5432/evaluator
      REDIS_URL: redis://redis:6379
    depends_on:
      - db
      - redis
      - minio
  
  worker:
    build: .
    command: npm run workers
    environment:
      DATABASE_URL: postgresql://user:pass@db:5432/evaluator
      REDIS_URL: redis://redis:6379
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - db
      - redis
  
  db:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: evaluator
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
  
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### Files

```
Dockerfile
docker-compose.yml
docker-compose.prod.yml
k8s/
├── deployment.yaml
├── service.yaml
├── configmap.yaml
└── secrets.yaml
.github/
└── workflows/
    ├── ci.yml
    └── deploy.yml
```

---

## 5.9 Monitoring Setup

### Tasks

- [ ] Set up Prometheus metrics
- [ ] Create Grafana dashboards
- [ ] Configure alerting
- [ ] Set up log aggregation

### Metrics to Track

```typescript
const metrics = {
  // Queue metrics
  queueDepth: new Gauge('queue_depth', 'Number of jobs in queue'),
  jobDuration: new Histogram('job_duration_seconds', 'Job processing time'),
  
  // Container metrics
  containersCreated: new Counter('containers_created_total', 'Total containers created'),
  containerErrors: new Counter('container_errors_total', 'Container errors'),
  
  // API metrics
  httpRequestDuration: new Histogram('http_request_duration_seconds', 'HTTP request duration'),
  httpRequestsTotal: new Counter('http_requests_total', 'Total HTTP requests'),
  
  // Business metrics
  submissionsTotal: new Counter('submissions_total', 'Total submissions'),
  testsPassed: new Counter('tests_passed_total', 'Total tests passed'),
};
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Evaluation Framework",
    "panels": [
      {
        "title": "Queue Depth",
        "type": "graph",
        "targets": [{ "expr": "queue_depth" }]
      },
      {
        "title": "Job Duration",
        "type": "heatmap",
        "targets": [{ "expr": "job_duration_seconds" }]
      },
      {
        "title": "Test Success Rate",
        "type": "stat",
        "targets": [{ "expr": "rate(tests_passed_total[5m])" }]
      }
    ]
  }
}
```

---

## 5.10 Final Checklist

### Pre-launch Checklist

- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Security review complete
- [ ] Documentation complete
- [ ] Monitoring configured
- [ ] Backup strategy defined
- [ ] Rollback plan documented
- [ ] Load testing passed
- [ ] Error tracking configured
- [ ] Rate limiting enabled

### Production Readiness

- [ ] Environment variables documented
- [ ] Secrets management configured
- [ ] SSL/TLS certificates installed
- [ ] CDN configured for static assets
- [ ] Database backups automated
- [ ] Log rotation configured
- [ ] Health check endpoints working
- [ ] Graceful shutdown tested

---

## Deliverables Checklist

- [ ] Unit tests complete (>80% coverage)
- [ ] Integration tests complete
- [ ] E2E tests passing
- [ ] Performance benchmarks met
- [ ] Optimizations applied
- [ ] Documentation complete
- [ ] Deployment manifests ready
- [ ] Monitoring configured
- [ ] Production readiness verified

---

## Post-Launch

### Monitoring

- Watch for errors in production
- Monitor queue depth and worker health
- Track API response times
- Review resource usage

### Maintenance

- Regular security updates
- Database maintenance
- Log review
- Performance tuning based on real usage

---

## Summary

This implementation plan covers all aspects of building the Programming Language Evaluation Framework:

1. **Phase 1**: Core infrastructure with database, API, and Docker skeleton
2. **Phase 2**: Job queue system with BullMQ and workers
3. **Phase 3**: Security hardening with container isolation
4. **Phase 4**: Frontend dashboard with real-time updates
5. **Phase 5**: Testing, optimization, and deployment

Each phase builds on the previous, allowing for incremental development and early testing of core functionality.
