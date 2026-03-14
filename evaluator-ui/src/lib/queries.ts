import { queryOptions } from '@tanstack/react-query';
import { teamsApi, testCasesApi, submissionsApi, sourceFilesApi } from './api-client';

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
  
  testRuns: (submissionId: string) =>
    queryOptions({
      queryKey: ['submissions', submissionId, 'test-runs'],
      queryFn: () => submissionsApi.testRuns(submissionId),
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
