import { createRouter, createRootRouteWithContext, createRoute, Outlet } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { teamQueries, testCaseQueries, submissionQueries, sourceFileQueries, dockerfileQueries } from './lib/queries';
import { Layout } from './components/layout';
import { TeamsPage } from './pages/teams';
import { TeamDetailPage } from './pages/teams/[teamId]';
import { TestCasesPage } from './pages/test-cases';
import { TestCaseDetailPage } from './pages/test-cases/$testCaseId';
import { SubmissionsPage } from './pages/submissions';
import { SubmissionDetailPage } from './pages/submissions/[submissionId]';
import { DockerfileVersionPage } from './pages/dockerfiles/[dockerfileId]/versions/[version]';

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

const testCaseDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/test-cases/$testCaseId',
  component: TestCaseDetailPage,
  loader: ({ context, params }) => {
    context.queryClient.ensureQueryData(testCaseQueries.detail(params.testCaseId));
  },
});

const submissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/submissions',
  component: SubmissionsPage,
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(submissionQueries.list());
    context.queryClient.ensureQueryData(teamQueries.list());
    context.queryClient.ensureQueryData(dockerfileQueries.list());
  },
});

const submissionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/submissions/$submissionId',
  component: SubmissionDetailPage,
  loader: ({ context, params }) => {
    context.queryClient.ensureQueryData(submissionQueries.detail(params.submissionId));
  },
});

const dockerfileVersionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dockerfiles/$dockerfileId/versions/$version',
  component: DockerfileVersionPage,
  loader: ({ context, params }) => {
    const version = parseInt(params.version, 10);
    context.queryClient.ensureQueryData(dockerfileQueries.detail(params.dockerfileId));
    context.queryClient.ensureQueryData(dockerfileQueries.version(params.dockerfileId, version));
  },
});

const routeTree = rootRoute.addChildren([indexRoute, teamsRoute, teamDetailRoute, testCasesRoute, testCaseDetailRoute, submissionsRoute, submissionDetailRoute, dockerfileVersionRoute]);

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
