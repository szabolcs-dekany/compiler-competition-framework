import { useQueryClient } from "@tanstack/react-query";
import type { BuildLogEvent, DockerfileVersionDto } from "@evaluator/shared";
import { dockerfilesApi } from "@/lib/api-client";
import { dockerfileQueries } from "@/lib/queries";
import { useEventSource } from "./use-event-source";

interface UseDockerfileBuildStreamOptions {
  dockerfileId: string;
  version: number;
  buildStatus: DockerfileVersionDto["buildStatus"];
  enabled?: boolean;
  onLog?: (message: string) => void;
}

function replaceVersion(
  versions: DockerfileVersionDto[] | undefined,
  nextVersion: DockerfileVersionDto,
): DockerfileVersionDto[] | undefined {
  if (!versions) {
    return versions;
  }

  let changed = false;

  const nextVersions = versions.map((version) => {
    if (version.version !== nextVersion.version) {
      return version;
    }

    changed = true;
    return nextVersion;
  });

  return changed ? nextVersions : versions;
}

export function useDockerfileBuildStream({
  dockerfileId,
  version,
  buildStatus,
  enabled = true,
  onLog,
}: UseDockerfileBuildStreamOptions): void {
  const queryClient = useQueryClient();
  const shouldStream =
    enabled && (buildStatus === "PENDING" || buildStatus === "BUILDING");

  useEventSource({
    url: dockerfilesApi.getBuildLogStreamUrl(dockerfileId, version),
    enabled: shouldStream,
    onMessage: (data, close) => {
      const event = JSON.parse(data) as BuildLogEvent;

      if (event.type === "log") {
        onLog?.(event.message);
        return;
      }

      const nextVersion = event.version;

      queryClient.setQueryData<DockerfileVersionDto[]>(
        dockerfileQueries.versions(dockerfileId).queryKey,
        (current) => replaceVersion(current, nextVersion),
      );
      queryClient.setQueryData<DockerfileVersionDto>(
        dockerfileQueries.version(dockerfileId, nextVersion.version).queryKey,
        nextVersion,
      );

      if (event.type === "complete") {
        if (nextVersion.buildLogS3Key) {
          void queryClient.invalidateQueries({
            queryKey: dockerfileQueries.buildLogs(
              dockerfileId,
              nextVersion.version,
            ).queryKey,
          });
        }

        close();
      }
    },
  });
}
