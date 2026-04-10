import { useQueryClient } from "@tanstack/react-query";
import type {
  CompileLogEvent,
  SubmissionCompilationDto,
  SubmissionDto,
} from "@evaluator/shared";
import { CompileStatus } from "@evaluator/shared";
import { submissionsApi } from "@/lib/api-client";
import { submissionQueries } from "@/lib/queries";
import { useEventSource } from "./use-event-source";

interface UseSubmissionCompileStreamOptions {
  submissionId: string;
  status: CompileStatus;
  enabled?: boolean;
  onLog?: (message: string) => void;
}

function replaceSubmission(
  submissions: SubmissionDto[] | undefined,
  nextSubmission: SubmissionDto,
): SubmissionDto[] | undefined {
  if (!submissions) {
    return submissions;
  }

  let changed = false;

  const nextSubmissions = submissions.map((submission) => {
    if (submission.id !== nextSubmission.id) {
      return submission;
    }

    changed = true;
    return nextSubmission;
  });

  return changed ? nextSubmissions : submissions;
}

function replaceCompilation(
  compilations: SubmissionCompilationDto[] | undefined,
  nextCompilation: SubmissionCompilationDto,
): SubmissionCompilationDto[] | undefined {
  if (!compilations) {
    return compilations;
  }

  const index = compilations.findIndex(
    (compilation) => compilation.testCaseId === nextCompilation.testCaseId,
  );

  if (index === -1) {
    return compilations;
  }

  const nextCompilations = [...compilations];
  nextCompilations[index] = nextCompilation;
  return nextCompilations;
}

export function useSubmissionCompileStream({
  submissionId,
  status,
  enabled = true,
  onLog,
}: UseSubmissionCompileStreamOptions): void {
  const queryClient = useQueryClient();
  const shouldStream =
    enabled &&
    (status === CompileStatus.PENDING || status === CompileStatus.RUNNING);

  useEventSource({
    url: submissionsApi.getCompileLogStreamUrl(submissionId),
    enabled: shouldStream,
    onMessage: (data, close) => {
      let event: CompileLogEvent;

      try {
        event = JSON.parse(data) as CompileLogEvent;
      } catch (error: unknown) {
        console.error("Failed to parse CompileLogEvent during SSE handling", {
          submissionId,
          data,
          error,
        });
        close();
        return;
      }

      if (event.type === "log") {
        onLog?.(event.message);
        return;
      }

      if (event.type === "compilation-status") {
        queryClient.setQueryData<SubmissionCompilationDto[]>(
          submissionQueries.compilations(submissionId).queryKey,
          (current) => replaceCompilation(current, event.compilation),
        );
        return;
      }

      const nextSubmission = event.submission;

      queryClient.setQueryData<SubmissionDto[]>(
        submissionQueries.list().queryKey,
        (current) => replaceSubmission(current, nextSubmission),
      );
      queryClient.setQueryData<SubmissionDto>(
        submissionQueries.detail(nextSubmission.id).queryKey,
        nextSubmission,
      );
      queryClient.setQueryData<SubmissionDto[]>(
        submissionQueries.byTeam(nextSubmission.teamId).queryKey,
        (current) => replaceSubmission(current, nextSubmission),
      );

      if (event.type === "complete") {
        if (nextSubmission.compileLogS3Key) {
          void queryClient.invalidateQueries({
            queryKey: submissionQueries.compileLogs(nextSubmission.id).queryKey,
          });
        }

        close();
      }
    },
  });
}
