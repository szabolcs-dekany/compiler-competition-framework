import { useQueryClient } from "@tanstack/react-query";
import type {
  CompileLogEvent,
  SubmissionCompilationDto,
  SubmissionDto,
  TestRunDto,
} from "@evaluator/shared";
import { SubmissionStatus } from "@evaluator/shared";
import { submissionsApi } from "@/lib/api-client";
import { submissionQueries } from "@/lib/queries";
import { useEventSource } from "./use-event-source";

interface UseSubmissionCompileStreamOptions {
  submissionId: string;
  submissionStatus: SubmissionStatus;
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
    return [nextCompilation];
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

function replaceTestRun(
  testRuns: TestRunDto[] | undefined,
  nextTestRun: TestRunDto,
): TestRunDto[] | undefined {
  if (!testRuns) {
    return [nextTestRun];
  }

  const index = testRuns.findIndex(
    (testRun) => testRun.testCaseId === nextTestRun.testCaseId,
  );

  if (index === -1) {
    return [...testRuns, nextTestRun].sort((left, right) =>
      left.testCaseId.localeCompare(right.testCaseId),
    );
  }

  const nextTestRuns = [...testRuns];
  nextTestRuns[index] = nextTestRun;
  return nextTestRuns;
}

export function useSubmissionCompileStream({
  submissionId,
  submissionStatus,
  enabled = true,
  onLog,
}: UseSubmissionCompileStreamOptions): void {
  const queryClient = useQueryClient();
  const terminalStatuses: SubmissionStatus[] = [
    SubmissionStatus.COMPLETED,
    SubmissionStatus.FAILED,
  ];
  const shouldStream =
    enabled && !terminalStatuses.includes(submissionStatus);

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

      if (event.type === "test-run-status") {
        queryClient.setQueryData<TestRunDto[]>(
          submissionQueries.testRuns(submissionId).queryKey,
          (current) => replaceTestRun(current, event.testRun),
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
