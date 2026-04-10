import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CompileStatus } from "@evaluator/shared";
import { submissionQueries, teamQueries } from "@/lib/queries";
import { useSubmissionCompileStream } from "@/lib/hooks/use-submission-compile-stream";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
      <Badge
        variant="default"
        className="gap-1 bg-green-600 hover:bg-green-700"
      >
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
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading logs...
      </div>
    );
  }

  return (
    <pre
      ref={logContainerRef}
      className="bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-auto h-96 text-sm font-mono"
    >
      {logs.length === 0 ? (
        <span className="text-zinc-500">No logs available yet...</span>
      ) : (
        logs.map((line, i) => <div key={i}>{line}</div>)
      )}
    </pre>
  );
}

export function SubmissionDetailPage() {
  const { submissionId } = useParams({ from: "/submissions/$submissionId" });
  const [liveLogs, setLiveLogs] = useState<string[]>([]);

  const { data: submission } = useQuery(submissionQueries.detail(submissionId));
  const { data: team } = useQuery({
    ...teamQueries.detail(submission?.teamId ?? ""),
    enabled: !!submission?.teamId,
  });

  const shouldFetchLogs =
    submission?.compileStatus === CompileStatus.SUCCESS ||
    submission?.compileStatus === CompileStatus.FAILED;
  const { data: storedLogs, isLoading: logsLoading } = useQuery({
    ...submissionQueries.compileLogs(submissionId),
    enabled: shouldFetchLogs && !!submission?.compileLogS3Key,
  });

  useEffect(() => {
    setLiveLogs([]);
  }, [submissionId]);

  useSubmissionCompileStream({
    submissionId,
    status: submission?.compileStatus ?? CompileStatus.PENDING,
    enabled: !!submission,
    onLog: (message) => {
      setLiveLogs((current) => [...current, message]);
    },
  });

  const storedLogLines = storedLogs?.logs ? storedLogs.logs.split("\n") : [];
  const logs = storedLogLines.length > 0 ? storedLogLines : liveLogs;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/submissions">
            <ArrowLeft className="h-4 w-4 mr-1" />
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
              <span className="font-medium">{team?.name ?? "Loading..."}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">
                v{submission?.version ?? "..."}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">File</span>
              <span className="font-medium">
                {submission?.originalName ?? "..."}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium">{submission?.status ?? "..."}</span>
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
                  : "..."}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compile Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              {submission && (
                <CompileStatusBadge status={submission.compileStatus} />
              )}
            </div>
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
                  {formatDistanceToNow(
                    new Date(submission.compileCompletedAt),
                    { addSuffix: true },
                  )}
                </span>
              </div>
            )}
            {submission?.compileError && (
              <div className="mt-2 p-2 bg-destructive/10 text-destructive rounded text-sm">
                {submission.compileError}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compile Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <CompileLogViewer
            logs={logs}
            isLoading={logsLoading && shouldFetchLogs}
          />
        </CardContent>
      </Card>
    </div>
  );
}
