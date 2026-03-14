import { createRouter, createRootRouteWithContext, createRoute, Outlet } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { teamQueries, testCaseQueries, submissionQueries, sourceFileQueries } from './lib/queries';
import { Layout } from './components/layout';
import { TeamsPage } from './pages/teams';
import { TeamDetailPage } from './pages/teams/[teamId]';
import { TestCasesPage } from './pages/test-cases';
import { SubmissionsPage } from './pages/submissions';

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: TeamsPage,
});

const teamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams',
  component: TeamsPage,
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(teamQueries.list());
  },
});

const teamDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams/$teamId',
  component: TeamDetailPage,
  loader: ({ context, params }) => {
    context.queryClient.ensureQueryData(teamQueries.detail(params.teamId));
    context.queryClient.ensureQueryData(sourceFileQueries.list(params.teamId));
    context.queryClient.ensureQueryData(testCaseQueries.list());
  },
});

const testCasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/test-cases',
  component: TestCasesPage,
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(testCaseQueries.list());
  },
});

const submissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/submissions',
  component: SubmissionsPage,
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(submissionQueries.list());
  },
});

const routeTree = rootRoute.addChildren([indexRoute, teamsRoute, teamDetailRoute, testCasesRoute, submissionsRoute]);

export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
