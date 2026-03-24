import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { BuildLogEvent, BuildStatus } from '@evaluator/shared';
import { dockerfileQueries, teamQueries } from '@/lib/queries';
import { dockerfilesApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function BuildStatusBadge({ status }: { status: BuildStatus }) {
  if (status === 'PENDING') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  }

  if (status === 'BUILDING') {
    return (
      <Badge variant="default" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Building
      </Badge>
    );
  }

  if (status === 'SUCCESS') {
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

function BuildLogViewer({
  initialLogs,
  isLoading,
  status,
  dockerfileId,
  version,
}: {
  initialLogs: string[];
  isLoading: boolean;
  status: BuildStatus;
  dockerfileId: string;
  version: number;
}) {
  const logContainerRef = useRef<HTMLPreElement>(null);
  const [logs, setLogs] = useState<string[]>(initialLogs);

  useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (status !== 'BUILDING') return;

    const eventSource = new EventSource(
      dockerfilesApi.getBuildLogStreamUrl(dockerfileId, version),
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as BuildLogEvent;
      if (data.type === 'log' && data.message) {
        setLogs((prev) => [...prev, data.message!]);
      }
      if (data.type === 'complete' || data.type === 'error') {
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [status, dockerfileId, version]);

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

export function DockerfileVersionPage() {
  const { dockerfileId, version: versionParam } = useParams({
    from: '/dockerfiles/$dockerfileId/versions/$version',
  });
  const version = parseInt(versionParam, 10);

  const { data: dockerfile } = useQuery(dockerfileQueries.detail(dockerfileId));
  const { data: versionData } = useQuery(dockerfileQueries.version(dockerfileId, version));
  const { data: team } = useQuery({
    ...teamQueries.detail(dockerfile?.teamId ?? ''),
    enabled: !!dockerfile?.teamId,
  });

  const shouldFetchLogs = versionData?.buildStatus === 'SUCCESS' || versionData?.buildStatus === 'FAILED';
  const { data: storedLogs, isLoading: logsLoading } = useQuery({
    ...dockerfileQueries.buildLogs(dockerfileId, version),
    enabled: shouldFetchLogs && !!versionData?.buildLogS3Key,
  });

  const initialLogs = storedLogs?.logs ? storedLogs.logs.split('\n') : [];

  const handleDownload = () => {
    dockerfilesApi.downloadVersion(dockerfileId, version).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Dockerfile_v${version}`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

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
            <CardTitle className="text-lg">Dockerfile Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Team</span>
              <span className="font-medium">{team?.name ?? 'Loading...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">v{version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Size</span>
              <span>{versionData ? `${(versionData.size / 1024).toFixed(1)} KB` : '...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Checksum</span>
              <span className="font-mono text-sm">
                {versionData ? `${versionData.checksum.slice(0, 8)}...` : '...'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Uploaded</span>
              <span>
                {versionData
                  ? formatDistanceToNow(new Date(versionData.uploadedAt), { addSuffix: true })
                  : '...'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Build Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              {versionData && <BuildStatusBadge status={versionData.buildStatus} />}
            </div>
            {versionData?.buildStartedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Started</span>
                <span>
                  {formatDistanceToNow(new Date(versionData.buildStartedAt), { addSuffix: true })}
                </span>
              </div>
            )}
            {versionData?.buildCompletedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed</span>
                <span>
                  {formatDistanceToNow(new Date(versionData.buildCompletedAt), { addSuffix: true })}
                </span>
              </div>
            )}
            {versionData?.buildError && (
              <div className="mt-2 p-2 bg-destructive/10 text-destructive rounded text-sm">
                {versionData.buildError}
              </div>
            )}
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" />
                Download Dockerfile
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Build Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <BuildLogViewer
            initialLogs={initialLogs}
            isLoading={logsLoading && shouldFetchLogs}
            status={versionData?.buildStatus ?? 'PENDING'}
            dockerfileId={dockerfileId}
            version={version}
          />
        </CardContent>
      </Card>
    </div>
  );
}
