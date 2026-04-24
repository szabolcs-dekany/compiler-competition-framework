# Evaluator UI

Frontend application for the Programming Language Evaluation Framework - a competitive programming contest system where teams submit custom compilers that produce native machine code.

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Routing**: TanStack Router
- **State Management**: TanStack Query (React Query)
- **UI Components**: shadcn/ui (Radix primitives)
- **Styling**: Tailwind CSS 4
- **Forms**: React Hook Form + Zod
- **Icons**: Lucide React

## Prerequisites

- Node.js 20+
- npm 10+
- Repository dependencies installed from the monorepo root
- Shared package built before starting the UI
- Backend API running on `http://localhost:3000`

## Getting Started

### 1. Install Dependencies

From the repository root:

```bash
npm install
```

### 2. Build Shared Types

The UI imports `@evaluator/shared`, so build it before starting the dev server:

```bash
npm run build --workspace shared
```

If you are editing shared types during development, run watch mode in another terminal instead:

```bash
npm run dev --workspace shared
```

### 3. Start the Backend

The Vite dev server proxies `/api` requests to `http://localhost:3000`, so start the backend first:

```bash
docker-compose up -d
cp evaluator-api/.env.example evaluator-api/.env
npx prisma generate --schema evaluator-api/prisma/schema.prisma
npx prisma migrate dev --schema evaluator-api/prisma/schema.prisma
npm run start:dev --workspace evaluator-api
```

### 4. Start Development Server

```bash
npm run dev --workspace evaluator-ui
```

The app runs on `http://localhost:5173` by default.

The Vite dev server proxies `/api` requests to the backend at `http://localhost:3000`.

## Project Structure

```
src/
├── components/
│   ├── ui/                # shadcn/ui primitives
│   ├── layout.tsx         # Main layout wrapper
│   ├── source-files/      # Source file management components
│   ├── submissions/       # Submission components
│   ├── teams/             # Team components
│   └── test-cases/        # Test case components
├── pages/                 # Route page components
│   ├── teams/
│   │   ├── index.tsx      # /teams - Teams list
│   │   └── [teamId]/      # /teams/:teamId - Team detail
│   ├── submissions/
│   │   └── page.tsx       # /submissions
│   └── test-cases/
│       └── index.tsx      # /test-cases
├── lib/
│   ├── api-client.ts      # API fetch functions by resource
│   ├── queries.ts         # TanStack Query options
│   ├── query-client.ts    # Query client instance
│   ├── hooks/             # Custom mutation hooks
│   └── utils.ts           # Utility functions
├── router.tsx             # TanStack Router config with loaders
├── main.tsx               # App entry point
└── index.css              # Global styles + Tailwind
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev --workspace evaluator-ui` | Start dev server (port 5173) |
| `npm run build --workspace evaluator-ui` | Build for production |
| `npm run lint --workspace evaluator-ui` | Run ESLint |
| `npm run preview --workspace evaluator-ui` | Preview production build |

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | TeamsPage | Redirects to teams list |
| `/teams` | TeamsPage | List all teams |
| `/teams/:teamId` | TeamDetailPage | Team details with source files |
| `/test-cases` | TestCasesPage | List all test cases |
| `/submissions` | SubmissionsPage | List all submissions |

## Architecture Patterns

### API Client

API functions are grouped by resource in `lib/api-client.ts`:

```typescript
export const teamsApi = {
  list: () => fetchJson<TeamDto[]>(`${API_BASE}/teams`),
  get: (id: string) => fetchJson<TeamDto>(`${API_BASE}/teams/${id}`),
  create: (data: CreateTeamDto) => fetchJson<TeamDto>(`${API_BASE}/teams`, { ... }),
};
```

### Query Options

Query options are centralized in `lib/queries.ts`:

```typescript
export const teamQueries = {
  list: () => queryOptions({ queryKey: ['teams'], queryFn: () => teamsApi.list() }),
  detail: (id: string) => queryOptions({ queryKey: ['teams', id], queryFn: () => teamsApi.get(id) }),
};
```

### Mutation Hooks

Mutations with cache invalidation in `lib/hooks/`:

```typescript
export function useUploadSourceFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, file }) => sourceFilesApi.upload(data, file),
    onSuccess: (_, { data }) => {
      queryClient.invalidateQueries({ queryKey: sourceFileQueries.list(data.teamId).queryKey });
    },
  });
}
```

### Route Loaders

Routes prefetch data via loaders in `router.tsx`:

```typescript
const teamDetailRoute = createRoute({
  path: '/teams/$teamId',
  component: TeamDetailPage,
  loader: ({ context, params }) => {
    context.queryClient.ensureQueryData(teamQueries.detail(params.teamId));
    context.queryClient.ensureQueryData(sourceFileQueries.list(params.teamId));
  },
});
```

### Page Components

Pages use `useSuspenseQuery` for data fetching:

```typescript
export function TeamDetailPage() {
  const { teamId } = useParams({ from: '/teams/$teamId' });
  const { data: team } = useSuspenseQuery(teamQueries.detail(teamId));
  const { data: sourceFiles } = useSuspenseQuery(sourceFileQueries.list(teamId));
  // ...
}
```

## Adding Components

### shadcn/ui Components

```bash
npx shadcn add button
npx shadcn add dialog
npx shadcn add form
```

### Custom Components

Place feature-specific components in their respective folders:
- `components/source-files/` - Source file related components
- `components/teams/` - Team related components
- etc.

## Path Aliases

Configured in `vite.config.ts`:

| Alias | Path |
|-------|------|
| `@/*` | `./src/*` |

Example usage:
```typescript
import { Button } from '@/components/ui/button';
import { teamQueries } from '@/lib/queries';
```

## API Proxy

Development requests to `/api/*` are proxied to the backend:

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: true },
  },
}
```

## Shared Types

Types are imported from the `@evaluator/shared` package:

```typescript
import type { TeamDto, SourceFileDto, TestCaseBlueprint } from '@evaluator/shared';
```

## Styling

- Tailwind CSS 4 with CSS variables for theming
- shadcn/ui components use Radix primitives
- Dark mode support via `next-themes`
- Global styles in `src/index.css`

## License

UNLICENSED - Private project
