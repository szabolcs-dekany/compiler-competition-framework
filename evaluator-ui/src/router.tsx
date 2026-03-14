import { createRouter, createRootRouteWithContext, createRoute, Outlet } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { teamQueries } from './lib/queries';
import { testCaseQueries } from './lib/queries';
import { Layout } from './components/layout';
import { TeamsPage } from './pages/teams';
import { TestCasesPage } from './pages/test-cases';

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

const testCasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/test-cases',
  component: TestCasesPage,
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(testCaseQueries.list());
  },
});

const routeTree = rootRoute.addChildren([indexRoute, teamsRoute, testCasesRoute]);

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
