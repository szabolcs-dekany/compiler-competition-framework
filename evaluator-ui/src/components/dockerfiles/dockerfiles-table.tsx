import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  DockerfileListDto,
  DockerfileVersionDto,
  BuildStatus,
} from "@evaluator/shared";
import { useDockerfileBuildStream } from "@/lib/hooks/use-dockerfile-build-stream";
import { dockerfileQueries } from "@/lib/queries";
import { useDownloadDockerfile } from "@/lib/hooks/use-dockerfiles-mutations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DockerfilesTableProps {
  dockerfiles: DockerfileListDto[];
}

function BuildStatusBadge({ status }: { status: BuildStatus }) {
  if (status === "PENDING") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  }

  if (status === "BUILDING") {
    return (
      <Badge variant="default" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Building
      </Badge>
    );
  }

  if (status === "SUCCESS") {
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

function DockerfileVersionRow({
  dockerfileId,
  version,
  onDownload,
}: {
  dockerfileId: string;
  version: DockerfileVersionDto;
  onDownload: (version: DockerfileVersionDto) => void;
}) {
  useDockerfileBuildStream({
    dockerfileId,
    version: version.version,
    buildStatus: version.buildStatus,
  });

  return (
    <TableRow className="border-0 hover:bg-muted/30">
      <TableCell className="py-2 pl-4">v{version.version}</TableCell>
      <TableCell className="py-2">
        <BuildStatusBadge status={version.buildStatus} />
      </TableCell>
      <TableCell className="py-2">
        {(version.size / 1024).toFixed(1)} KB
      </TableCell>
      <TableCell className="py-2 font-mono text-sm">
        {version.checksum.slice(0, 8)}...
      </TableCell>
      <TableCell className="py-2 text-muted-foreground text-sm">
        {formatDistanceToNow(new Date(version.uploadedAt), { addSuffix: true })}
      </TableCell>
      <TableCell className="py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild>
            <Link
              to="/dockerfiles/$dockerfileId/versions/$version"
              params={{
                dockerfileId,
                version: String(version.version),
              }}
            >
              <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => onDownload(version)}
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function VersionsContent({ dockerfileId }: { dockerfileId: string }) {
  const { data: versions, isLoading } = useQuery(
    dockerfileQueries.versions(dockerfileId),
  );
  const downloadDockerfile = useDownloadDockerfile();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading versions...
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No versions found
      </div>
    );
  }

  const handleDownload = (version: DockerfileVersionDto) => {
    downloadDockerfile.mutate({
      id: dockerfileId,
      version: version.version,
      filename: `Dockerfile_v${version.version}`,
    });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-0 hover:bg-transparent">
          <TableHead className="text-xs text-muted-foreground h-8">
            Version
          </TableHead>
          <TableHead className="text-xs text-muted-foreground h-8">
            Build Status
          </TableHead>
          <TableHead className="text-xs text-muted-foreground h-8">
            Size
          </TableHead>
          <TableHead className="text-xs text-muted-foreground h-8">
            Checksum
          </TableHead>
          <TableHead className="text-xs text-muted-foreground h-8">
            Uploaded
          </TableHead>
          <TableHead className="text-xs text-muted-foreground h-8 w-20"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {versions.map((v) => (
          <DockerfileVersionRow
            key={v.id}
            dockerfileId={dockerfileId}
            version={v}
            onDownload={handleDownload}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function DockerfileTableRow({
  dockerfile,
  expanded,
  onToggle,
}: {
  dockerfile: DockerfileListDto;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onToggle}>
        <TableCell className="w-10">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
        <TableCell className="font-medium">{dockerfile.teamName}</TableCell>
        <TableCell>v{dockerfile.version}</TableCell>
        <TableCell>{(dockerfile.size / 1024).toFixed(1)} KB</TableCell>
        <TableCell className="font-mono text-sm">
          {dockerfile.checksum.slice(0, 8)}...
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatDistanceToNow(new Date(dockerfile.uploadedAt), {
            addSuffix: true,
          })}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="p-0 border-0">
            <div className="pl-10 pr-4">
              <VersionsContent dockerfileId={dockerfile.id} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function DockerfilesTable({ dockerfiles }: DockerfilesTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (dockerfiles.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No Dockerfiles uploaded yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10"></TableHead>
          <TableHead>Team</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Checksum</TableHead>
          <TableHead>Uploaded</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dockerfiles.map((df) => (
          <DockerfileTableRow
            key={df.id}
            dockerfile={df}
            expanded={expandedRows.has(df.id)}
            onToggle={() => toggleRow(df.id)}
          />
        ))}
      </TableBody>
    </Table>
  );
}
