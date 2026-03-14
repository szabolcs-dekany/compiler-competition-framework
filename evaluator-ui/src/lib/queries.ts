import { queryOptions } from '@tanstack/react-query';
import { teamsApi, testCasesApi } from './api-client';

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
