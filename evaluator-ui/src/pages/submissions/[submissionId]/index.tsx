import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CompilationStatus,
  CompileStatus,
  TestRunStatus,
  SubmissionStatus,
} from '@evaluator/shared';
import { submissionsApi } from '@/lib/api-client';
import { submissionQueries, teamQueries } from '@/lib/queries';
import { useSubmissionCompileStream } from '@/lib/hooks/use-submission-compile-stream';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Loader2,
  PlayCircle,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function CompileStatusBadge({ status }: { status: CompileStatus }) {
  if (status === CompileStatus.PENDING) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  }

  if (status === CompileStatus.RUNNING) {
    return (
      <Badge variant="default" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running
      </Badge>
    );
  }

  if (status === CompileStatus.SUCCESS) {
    return (
      <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
        <CheckCircle className="h-3 w-3" />
        Success
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" />
      Failed
    </Badge>
  );
}

function CompilationStatusBadge({ status }: { status: CompilationStatus }) {
  if (status === CompilationStatus.PENDING) {
    return <Badge variant="secondary">Pending</Badge>;
  }

  if (status === CompilationStatus.IN_PROGRESS) {
    return (
      <Badge variant="default" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Compiling
      </Badge>
    );
  }

  if (status === CompilationStatus.SUCCESS) {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-700">
        Ready
      </Badge>
    );
  }

  return <Badge variant="destructive">Failed</Badge>;
}

function TestRunStatusBadge({ status }: { status: TestRunStatus }) {
  if (status === TestRunStatus.PENDING) {
    return <Badge variant="secondary">Pending</Badge>;
  }

  if (status === TestRunStatus.RUNNING || status === TestRunStatus.COMPILING) {
    return (
      <Badge variant="default" className="gap-1">
        <PlayCircle className="h-3 w-3" />
        Running
      </Badge>
    );
  }

  if (status === TestRunStatus.PASSED) {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-700">
        Passed
      </Badge>
    );
  }

  if (status === TestRunStatus.TIMEOUT) {
    return <Badge variant="destructive">Timeout</Badge>;
  }

  if (status === TestRunStatus.ERROR) {
    return <Badge variant="destructive">Error</Badge>;
  }

  return <Badge variant="destructive">Failed</Badge>;
}

function formatSubmissionStatus(status: SubmissionStatus | undefined): string {
  if (!status) {
    return '...';
  }

  return status.replace(/_/g, ' ');
}

function formatRuntime(runtimeMs: number | null | undefined): string {
  if (runtimeMs === null || runtimeMs === undefined) {
    return '—';
  }

  return `${runtimeMs}ms`;
}

function CompileLogViewer({
  logs,
  isLoading,
}: {
  logs: string[];
  isLoading: boolean;
}) {
  const logContainerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        Loading logs...
      </div>
    );
  }

  return (
    <pre
      ref={logContainerRef}
      className="h-96 overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-sm text-zinc-100"
    >
      {logs.length === 0 ? (
        <span className="text-zinc-500">No logs available yet...</span>
      ) : (
        logs.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)
      )}
    </pre>
  );
}

export function SubmissionDetailPage() {
  const { submissionId } = useParams({ from: '/submissions/$submissionId' });
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: submission } = useQuery(submissionQueries.detail(submissionId));
  const { data: compilations } = useQuery(submissionQueries.compilations(submissionId));
  const { data: testRuns } = useQuery(submissionQueries.testRuns(submissionId));
  const { data: team } = useQuery({
    ...teamQueries.detail(submission?.teamId ?? ''),
    enabled: !!submission?.teamId,
  });

  const { data: storedLogs, isLoading: logsLoading } = useQuery({
    ...submissionQueries.compileLogs(submissionId),
    enabled: !!submission?.compileLogS3Key,
  });

  useEffect(() => {
    setLiveLogs([]);
  }, [submissionId]);

  const rerunEvaluationsMutation = useMutation({
    mutationFn: () => submissionsApi.rerunEvaluations(submissionId),
    onSuccess: async () => {
      setLiveLogs([]);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: submissionQueries.detail(submissionId).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: submissionQueries.testRuns(submissionId).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: submissionQueries.compilations(submissionId).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: ['submissions', submissionId, 'test-runs'],
        }),
      ]);
    },
  });

  useSubmissionCompileStream({
    submissionId,
    submissionStatus: submission?.status ?? SubmissionStatus.PENDING,
    enabled: !!submission,
    onLog: (message) => {
      setLiveLogs((current) => [...current, message]);
    },
  });

  const storedLogLines = storedLogs?.logs ? storedLogs.logs.split('\n') : [];
  const logs = storedLogLines.length > 0 ? storedLogLines : liveLogs;
  const canRerunEvaluations =
    !!submission &&
    submission.compileStatus !== CompileStatus.PENDING &&
    submission.compileStatus !== CompileStatus.RUNNING &&
    (compilations?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/submissions">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Submission Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Team</span>
              <span className="font-medium">{team?.name ?? 'Loading...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">v{submission?.version ?? '...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">File</span>
              <span className="font-medium">{submission?.originalName ?? '...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pipeline</span>
              <span className="font-medium">{formatSubmissionStatus(submission?.status)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Score</span>
              <span className="font-medium">{submission?.totalScore ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Submitted</span>
              <span>
                {submission
                  ? formatDistanceToNow(new Date(submission.submittedAt), {
                      addSuffix: true,
                    })
                  : '...'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-lg">Compile Status</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => rerunEvaluationsMutation.mutate()}
                disabled={
                  !canRerunEvaluations || rerunEvaluationsMutation.isPending
                }
              >
                {rerunEvaluationsMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 h-4 w-4" />
                )}
                Re-run Evaluations
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              {submission && <CompileStatusBadge status={submission.compileStatus} />}
            </div>
            {rerunEvaluationsMutation.error instanceof Error && (
              <div className="rounded bg-destructive/10 p-2 text-sm text-destructive">
                {rerunEvaluationsMutation.error.message}
              </div>
            )}
            {submission?.compileStartedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Started</span>
                <span>
                  {formatDistanceToNow(new Date(submission.compileStartedAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            )}
            {submission?.compileCompletedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed</span>
                <span>
                  {formatDistanceToNow(new Date(submission.compileCompletedAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            )}
            {submission?.compileError && (
              <div className="rounded bg-destructive/10 p-2 text-sm text-destructive">
                {submission.compileError}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compilation Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test Case</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(compilations ?? []).map((compilation) => (
                <TableRow key={compilation.testCaseId}>
                  <TableCell>
                    <div className="font-medium">{compilation.testCase.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {compilation.testCase.id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <CompilationStatusBadge status={compilation.status} />
                  </TableCell>
                  <TableCell>
                    {compilation.startedAt
                      ? formatDistanceToNow(new Date(compilation.startedAt), {
                          addSuffix: true,
                        })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {compilation.completedAt
                      ? formatDistanceToNow(new Date(compilation.completedAt), {
                          addSuffix: true,
                        })
                      : '—'}
                  </TableCell>
                  <TableCell className="max-w-sm text-sm text-muted-foreground">
                    {compilation.errorMessage ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evaluation Results</CardTitle>
        </CardHeader>
        <CardContent>
          {testRuns && testRuns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test Case</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Runtime</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testRuns.map((testRun) => (
                  <TableRow key={testRun.testCaseId}>
                    <TableCell>
                      <div className="font-medium">{testRun.testCase.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {testRun.testCase.id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <TestRunStatusBadge status={testRun.status} />
                    </TableCell>
                    <TableCell>
                      {testRun.passedAttempts}/{testRun.attemptCount}
                    </TableCell>
                    <TableCell>{formatRuntime(testRun.runTimeMs)}</TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {testRun.pointsEarned + testRun.bonusEarned}
                      </span>
                      {testRun.bonusEarned > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (+{testRun.bonusEarned})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm text-sm text-muted-foreground">
                      {testRun.errorMessage ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">
              Evaluation results will appear after compilation succeeds.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compile Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <CompileLogViewer
            logs={logs}
            isLoading={logsLoading && !!submission?.compileLogS3Key}
          />
        </CardContent>
      </Card>
    </div>
  );
}
