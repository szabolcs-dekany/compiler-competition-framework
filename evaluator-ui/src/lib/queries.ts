import { queryOptions } from '@tanstack/react-query';
import { teamsApi } from './api-client';

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
