import { queryOptions } from '@tanstack/react-query';
import { teamsApi, testCasesApi, submissionsApi } from './api-client';

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
};
