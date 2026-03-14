import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourceFilesApi } from '../api-client';
import { sourceFileQueries } from '../queries';
import type { UploadSourceFileDto } from '@evaluator/shared';

export function useUploadSourceFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, file }: { data: UploadSourceFileDto; file: File }) =>
      sourceFilesApi.upload(data, file),
    onSuccess: (_, { data }) => {
      queryClient.invalidateQueries({
        queryKey: sourceFileQueries.list(data.teamId).queryKey,
      });
    },
  });
}

export function useReplaceSourceFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File; teamId: string }) =>
      sourceFilesApi.replace(id, file),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({
        queryKey: sourceFileQueries.list(teamId).queryKey,
      });
    },
  });
}

export function useDownloadSourceFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, version, filename }: { id: string; version?: number; filename: string }) => {
      const downloadPromise = version !== undefined
        ? sourceFilesApi.downloadVersion(id, version)
        : sourceFilesApi.download(id);
      
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
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: sourceFileQueries.versions(id).queryKey,
      });
    },
  });
}
