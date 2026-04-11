import { queryOptions } from '@tanstack/react-query';
import { teamsApi, testCasesApi, submissionsApi, sourceFilesApi, dockerfilesApi } from './api-client';

export const teamQueries = {
  list: () =>
    queryOptions({
      queryKey: ['teams'],
      queryFn: () => teamsApi.list(),
    }),
  
  detail: (id: string) =>
    queryOptions({
      queryKey: ['teams', id],
      queryFn: () => teamsApi.get(id),
    }),
};

export const testCaseQueries = {
  list: () =>
    queryOptions({
      queryKey: ['test-cases'],
      queryFn: () => testCasesApi.list(),
    }),
  
  detail: (id: string) =>
    queryOptions({
      queryKey: ['test-cases', id],
      queryFn: () => testCasesApi.get(id),
    }),
};

export const submissionQueries = {
  list: () =>
    queryOptions({
      queryKey: ['submissions'],
      queryFn: () => submissionsApi.list(),
    }),
  
  detail: (id: string) =>
    queryOptions({
      queryKey: ['submissions', id],
      queryFn: () => submissionsApi.get(id),
    }),
  
  byTeam: (teamId: string) =>
    queryOptions({
      queryKey: ['submissions', 'team', teamId],
      queryFn: () => submissionsApi.listByTeam(teamId),
    }),
  
  compilations: (submissionId: string) =>
    queryOptions({
      queryKey: ['submissions', submissionId, 'compilations'],
      queryFn: () => submissionsApi.compilations(submissionId),
    }),

  testRuns: (submissionId: string) =>
    queryOptions({
      queryKey: ['submissions', submissionId, 'test-runs'],
      queryFn: () => submissionsApi.testRuns(submissionId),
    }),

  testRunAttempts: (submissionId: string, testCaseId: string) =>
    queryOptions({
      queryKey: ['submissions', submissionId, 'test-runs', testCaseId, 'attempts'],
      queryFn: () => submissionsApi.testRunAttempts(submissionId, testCaseId),
    }),
  
  compileLogs: (id: string) =>
    queryOptions({
      queryKey: ['submissions', id, 'compile-logs'],
      queryFn: () => submissionsApi.getCompileLogs(id),
    }),
};

export const sourceFileQueries = {
  list: (teamId: string) =>
    queryOptions({
      queryKey: ['source-files', 'team', teamId],
      queryFn: () => sourceFilesApi.list(teamId),
    }),
  
  detail: (id: string) =>
    queryOptions({
      queryKey: ['source-files', id],
      queryFn: () => sourceFilesApi.get(id),
    }),
  
  versions: (id: string) =>
    queryOptions({
      queryKey: ['source-files', id, 'versions'],
      queryFn: () => sourceFilesApi.getVersions(id),
    }),
};

export const dockerfileQueries = {
  list: () =>
    queryOptions({
      queryKey: ['dockerfiles'],
      queryFn: () => dockerfilesApi.list(),
    }),

  byTeam: (teamId: string) =>
    queryOptions({
      queryKey: ['dockerfiles', 'team', teamId],
      queryFn: () => dockerfilesApi.getByTeam(teamId),
    }),

  detail: (id: string) =>
    queryOptions({
      queryKey: ['dockerfiles', id],
      queryFn: () => dockerfilesApi.getById(id),
    }),

  versions: (id: string) =>
    queryOptions({
      queryKey: ['dockerfiles', id, 'versions'],
      queryFn: () => dockerfilesApi.getVersions(id),
    }),

  version: (id: string, version: number) =>
    queryOptions({
      queryKey: ['dockerfiles', id, 'versions', version],
      queryFn: () => dockerfilesApi.getVersion(id, version),
    }),

  buildLogs: (id: string, version: number) =>
    queryOptions({
      queryKey: ['dockerfiles', id, 'versions', version, 'logs'],
      queryFn: () => dockerfilesApi.getBuildLogs(id, version),
    }),
};
