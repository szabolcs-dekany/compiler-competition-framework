import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dockerfilesApi } from '../api-client';
import { dockerfileQueries } from '../queries';

export function useUploadDockerfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, file }: { teamId: string; file: File }) =>
      dockerfilesApi.upload(teamId, file),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({
        queryKey: dockerfileQueries.byTeam(teamId).queryKey,
      });
    },
  });
}

export function useReplaceDockerfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File; teamId: string }) =>
      dockerfilesApi.replace(id, file),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: dockerfileQueries.byTeam(variables.teamId).queryKey,
      });
    },
  });
}

export function useDownloadDockerfile() {
  return useMutation({
    mutationFn: ({ id, version, filename }: { id: string; version?: number; filename: string }) => {
      const downloadPromise = version !== undefined
        ? dockerfilesApi.downloadVersion(id, version)
        : dockerfilesApi.download(id);

      return downloadPromise.then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    },
  });
}
