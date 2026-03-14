import { useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '../api-client';
import { teamQueries } from '../queries';
import type { CreateTeamDto } from '@evaluator/shared';

export function useCreateTeam() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateTeamDto) => teamsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamQueries.list().queryKey });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => teamsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamQueries.list().queryKey });
    },
  });
}
