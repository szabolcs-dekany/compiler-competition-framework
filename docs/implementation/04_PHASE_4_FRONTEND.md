# Phase 4: Dashboard & Real-time

**Duration: Week 5**

## Objectives

- Build frontend dashboard with Next.js
- Implement WebSocket integration for real-time updates
- Create leaderboard system
- Build result visualization and charts
- Implement submission management UI

---

## 4.1 Frontend Architecture

### Component Structure

```
src/components/
├── ui/                      # shadcn/ui base components
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── table.tsx
│   └── ...
├── layout/
│   ├── header.tsx
│   ├── sidebar.tsx
│   └── footer.tsx
├── dashboard/
│   ├── overview.tsx
│   ├── stats-card.tsx
│   └── activity-feed.tsx
├── submission/
│   ├── upload-form.tsx
│   ├── status-card.tsx
│   ├── test-run-list.tsx
│   └── result-details.tsx
├── leaderboard/
│   ├── table.tsx
│   ├── rank-badge.tsx
│   └── score-chart.tsx
└── test-cases/
    ├── category-list.tsx
    └── test-detail.tsx
```

---

## 4.2 Page Structure

### Tasks

- [ ] Create layout components
- [ ] Build dashboard page
- [ ] Build submissions page
- [ ] Build leaderboard page
- [ ] Build test cases page

### App Router Pages

```
src/app/
├── (dashboard)/
│   ├── layout.tsx           # Dashboard layout
│   ├── page.tsx             # Overview dashboard
│   ├── submissions/
│   │   ├── page.tsx         # Submissions list
│   │   ├── new/
│   │   │   └── page.tsx     # New submission
│   │   └── [id]/
│   │       └── page.tsx     # Submission details
│   ├── leaderboard/
│   │   └── page.tsx         # Leaderboard
│   └── test-cases/
│       ├── page.tsx         # Test cases list
│       └── [id]/
│           └── page.tsx     # Test case details
├── api/
│   └── ...
└── ws/
    └── [...]/route.ts       # WebSocket handler
```

---

## 4.3 WebSocket Server Setup (NestJS Gateway)

### Tasks

- [ ] Install @nestjs/platform-socket.io
- [ ] Create WebSocket gateway module
- [ ] Set up room-based subscriptions
- [ ] Implement connection authentication

### WebSocket Gateway

```typescript
// apps/api/src/modules/websocket/websocket.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST'],
  },
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket): void {
    const { submissionId } = client.handshake.query;
    
    if (submissionId) {
      client.join(`submission:${submissionId}`);
    }
  }

  handleDisconnect(client: Socket): void {
    // Cleanup if needed
  }

  @SubscribeMessage('subscribe:leaderboard')
  handleSubscribeLeaderboard(client: Socket): void {
    client.join('leaderboard');
  }

  @SubscribeMessage('unsubscribe:leaderboard')
  handleUnsubscribeLeaderboard(client: Socket): void {
    client.leave('leaderboard');
  }
}
```

### WebSocket Module

```typescript
// apps/api/src/modules/websocket/websocket.module.ts
import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { EventsService } from './events.service';

@Module({
  providers: [WebsocketGateway, EventsService],
  exports: [EventsService],
})
export class WebsocketModule {}
```

### Files

```
apps/api/src/modules/websocket/
├── websocket.module.ts
├── websocket.gateway.ts
├── events.service.ts
└── events.interface.ts
```

---

## 4.4 Real-time Event Emission

### Tasks

- [ ] Create event emission service (NestJS injectable)
- [ ] Emit test run progress
- [ ] Emit submission completion
- [ ] Emit leaderboard updates

### Event Types

```typescript
// packages/shared/src/types/events.ts
type WebSocketEvent =
  | { type: 'testrun:start'; data: { testCaseId: string; submissionId: string } }
  | { type: 'testrun:progress'; data: { testCaseId: string; progress: number } }
  | { type: 'testrun:complete'; data: TestRunResult }
  | { type: 'submission:progress'; data: { completed: number; total: number } }
  | { type: 'submission:complete'; data: { submissionId: string; totalScore: number } }
  | { type: 'leaderboard:update'; data: LeaderboardEntry };
```

### Event Emission Service (NestJS)

```typescript
// apps/api/src/modules/websocket/events.service.ts
import { Injectable } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { TestRunResult, LeaderboardEntry } from '@shared/types';

@Injectable()
export class EventsService {
  constructor(private readonly gateway: WebsocketGateway) {}

  async emitTestRunStart(submissionId: string, testCaseId: string): Promise<void> {
    this.gateway.server.to(`submission:${submissionId}`).emit('testrun:start', {
      testCaseId,
      submissionId,
    });
  }

  async emitTestRunComplete(data: TestRunResult): Promise<void> {
    this.gateway.server.to(`submission:${data.submissionId}`).emit('testrun:complete', data);
  }

  async emitSubmissionComplete(
    submissionId: string,
    totalScore: number
  ): Promise<void> {
    this.gateway.server.to(`submission:${submissionId}`).emit('submission:complete', {
      submissionId,
      totalScore,
    });
  }

  async emitLeaderboardUpdate(entry: LeaderboardEntry): Promise<void> {
    this.gateway.server.to('leaderboard').emit('leaderboard:update', entry);
  }
}
```

### Files

```
apps/api/src/modules/websocket/events.service.ts
packages/shared/src/types/events.ts
```

---

## 4.5 Frontend WebSocket Client

### Tasks

- [ ] Create WebSocket hook
- [ ] Handle connection state
- [ ] Implement reconnection logic
- [ ] Type event handlers

### WebSocket Hook

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type UseWebSocketOptions = {
  submissionId?: string;
  onTestRunComplete?: (data: TestRunResult) => void;
  onSubmissionComplete?: (data: { submissionId: string; totalScore: number }) => void;
};

export function useWebSocket(options: UseWebSocketOptions) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  
  useEffect(() => {
    const newSocket = io(process.env.NEXT_PUBLIC_WS_URL!, {
      query: { submissionId: options.submissionId },
    });
    
    newSocket.on('connect', () => setConnected(true));
    newSocket.on('disconnect', () => setConnected(false));
    
    if (options.onTestRunComplete) {
      newSocket.on('testrun:complete', options.onTestRunComplete);
    }
    
    if (options.onSubmissionComplete) {
      newSocket.on('submission:complete', options.onSubmissionComplete);
    }
    
    setSocket(newSocket);
    
    return () => {
      newSocket.close();
    };
  }, [options.submissionId]);
  
  return { socket, connected };
}
```

### Files

```
src/hooks/use-websocket.ts
```

---

## 4.6 Submission Upload UI

### Tasks

- [ ] Create upload form component
- [ ] Implement file validation
- [ ] Show upload progress
- [ ] Handle upload errors

### Upload Form Component

```typescript
interface UploadFormProps {
  teamId: string;
  onSuccess?: (submissionId: string) => void;
}

export function UploadForm({ teamId, onSuccess }: UploadFormProps) {
  const [compiler, setCompiler] = useState<File | null>(null);
  const [sources, setSources] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUploading(true);
    
    const formData = new FormData();
    formData.append('compiler', compiler!);
    sources.forEach((file) => formData.append('sources', file));
    
    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        body: formData,
      });
      
      const { id } = await response.json();
      onSuccess?.(id);
    } finally {
      setUploading(false);
    }
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <FileDropzone
        label="Compiler Archive"
        accept={['.tar.gz', '.zip']}
        onChange={setCompiler}
      />
      <FileDropzone
        label="Source Files"
        accept={['.lang']}
        multiple
        onChange={setSources}
      />
      <Button type="submit" loading={uploading}>
        Submit
      </Button>
    </form>
  );
}
```

### Files

```
src/components/submission/upload-form.tsx
```

---

## 4.7 Submission Status UI

### Tasks

- [ ] Create status card component
- [ ] Show test run progress
- [ ] Display individual test results
- [ ] Show detailed output comparison

### Status Card Component

```typescript
interface StatusCardProps {
  submission: Submission;
  testRuns: TestRun[];
}

export function StatusCard({ submission, testRuns }: StatusCardProps) {
  const completed = testRuns.filter(
    (run) => run.status === 'PASSED' || run.status === 'FAILED'
  ).length;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Submission Status</CardTitle>
        <Badge variant={statusVariant(submission.status)}>
          {submission.status}
        </Badge>
      </CardHeader>
      <CardContent>
        <Progress value={(completed / testRuns.length) * 100} />
        <p>{completed} / {testRuns.length} tests completed</p>
        <p>Total Score: {submission.totalScore}</p>
      </CardContent>
    </Card>
  );
}
```

### Files

```
src/components/submission/status-card.tsx
src/components/submission/test-run-list.tsx
```

---

## 4.8 Leaderboard UI

### Tasks

- [ ] Create leaderboard table
- [ ] Implement real-time updates
- [ ] Show rank changes
- [ ] Add filtering/sorting

### Leaderboard Component

```typescript
export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  
  useWebSocket({
    onLeaderboardUpdate: (entry) => {
      setEntries((prev) => {
        const updated = prev.filter((e) => e.teamId !== entry.teamId);
        return [...updated, entry].sort((a, b) => b.score - a.score);
      });
    },
  });
  
  useEffect(() => {
    fetch('/api/leaderboard')
      .then((res) => res.json())
      .then(setEntries);
  }, []);
  
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rank</TableHead>
          <TableHead>Team</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Tests Passed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry, index) => (
          <TableRow key={entry.teamId}>
            <TableCell>{index + 1}</TableCell>
            <TableCell>{entry.teamName}</TableCell>
            <TableCell>{entry.score}</TableCell>
            <TableCell>{entry.testsPassed}/{entry.totalTests}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

### Files

```
src/components/leaderboard/table.tsx
src/app/(dashboard)/leaderboard/page.tsx
```

---

## 4.9 Charts and Visualization

### Tasks

- [ ] Install chart library (Recharts)
- [ ] Create score distribution chart
- [ ] Create category breakdown chart
- [ ] Create performance comparison chart

### Dependencies

```bash
npm install recharts
```

### Score Chart Component

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface ScoreChartProps {
  data: { category: string; score: number; maxScore: number }[];
}

export function ScoreChart({ data }: ScoreChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <XAxis dataKey="category" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="score" fill="#4CAF50" />
        <Bar dataKey="maxScore" fill="#E0E0E0" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### Files

```
src/components/visualization/score-chart.tsx
src/components/visualization/category-breakdown.tsx
```

---

## 4.10 API Client

### Tasks

- [ ] Create typed API client
- [ ] Implement error handling
- [ ] Add request/response types

### API Client

```typescript
const API_BASE = '/api';

export const api = {
  teams: {
    create: (data: CreateTeamInput) =>
      fetchJSON<Team>(`${API_BASE}/teams`, { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) =>
      fetchJSON<Team>(`${API_BASE}/teams/${id}`),
  },
  submissions: {
    create: (data: FormData) =>
      fetchJSON<Submission>(`${API_BASE}/submissions`, { method: 'POST', body: data }),
    get: (id: string) =>
      fetchJSON<Submission>(`${API_BASE}/submissions/${id}`),
    getRuns: (id: string) =>
      fetchJSON<TestRun[]>(`${API_BASE}/submissions/${id}/runs`),
  },
  leaderboard: {
    get: () =>
      fetchJSON<LeaderboardEntry[]>(`${API_BASE}/leaderboard`),
  },
  testCases: {
    list: () =>
      fetchJSON<TestCase[]>(`${API_BASE}/test-cases`),
    get: (id: string) =>
      fetchJSON<TestCase>(`${API_BASE}/test-cases/${id}`),
  },
};

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    throw new APIError(response.status, await response.text());
  }
  
  return response.json();
}
```

### Files

```
src/lib/api-client.ts
```

---

## 4.11 State Management

### Tasks

- [ ] Evaluate state management needs
- [ ] Implement with React Query or Zustand
- [ ] Create data fetching hooks

### React Query Setup

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### Data Hooks

```typescript
export function useSubmission(id: string) {
  return useQuery({
    queryKey: ['submission', id],
    queryFn: () => api.submissions.get(id),
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api.leaderboard.get(),
  });
}
```

### Files

```
src/lib/query-client.ts
src/hooks/use-submission.ts
src/hooks/use-leaderboard.ts
```

---

## Deliverables Checklist

- [ ] Dashboard layout complete
- [ ] WebSocket server functional
- [ ] Real-time updates working
- [ ] Upload form functional
- [ ] Status display working
- [ ] Leaderboard with real-time updates
- [ ] Charts rendering correctly
- [ ] API client complete

---

## Testing Phase 4

### Component Tests

```bash
npm run test -- --testPathPattern="components"
```

### Integration Tests

```bash
npm run test -- --testPathPattern="e2e/dashboard"
```

### Manual Testing

1. Upload a submission
2. Watch real-time progress
3. Verify leaderboard updates
4. Check charts render correctly

---

## Next Phase

→ [Phase 5: Testing & Polish](./05_PHASE_5_TESTING.md)
