import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { SubmissionDto, SubmissionCompilationDto } from '@evaluator/shared';
import { CompileStatus, CompilationStatus } from '@evaluator/shared';
import { submissionQueries } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SubmissionsTableProps {
  submissions: SubmissionDto[];
}

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
    return (
      <Badge variant="secondary" className="text-xs gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  }

  if (status === CompilationStatus.IN_PROGRESS) {
    return (
      <Badge variant="default" className="text-xs gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        In Progress
      </Badge>
    );
  }

  if (status === CompilationStatus.SUCCESS) {
    return (
      <Badge variant="default" className="text-xs gap-1 bg-green-600 hover:bg-green-700">
        <CheckCircle className="h-3 w-3" />
        Success
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className="text-xs gap-1">
      <XCircle className="h-3 w-3" />
      Failed
    </Badge>
  );
}

function CompilationsContent({ submissionId }: { submissionId: string }) {
  const { data: compilations, isLoading } = useQuery(
    submissionQueries.compilations(submissionId),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading compilations...
      </div>
    );
  }

  if (!compilations || compilations.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No compilations yet
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-0 hover:bg-transparent">
          <TableHead className="text-xs text-muted-foreground h-8">
            Test Case
          </TableHead>
          <TableHead className="text-xs text-muted-foreground h-8">
            Category
          </TableHead>
          <TableHead className="text-xs text-muted-foreground h-8">
            Status
          </TableHead>
          <TableHead className="text-xs text-muted-foreground h-8">
            Compile Time
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {compilations.map((comp) => (
          <CompilationDetailRow key={comp.id} compilation={comp} />
        ))}
      </TableBody>
    </Table>
  );
}

function formatCompileTime(compilation: SubmissionCompilationDto): string {
  if (!compilation.startedAt || !compilation.completedAt) {
    return '-';
  }
  const ms =
    new Date(compilation.completedAt).getTime() -
    new Date(compilation.startedAt).getTime();
  return `${ms}ms`;
}

function CompilationDetailRow({
  compilation,
}: {
  compilation: SubmissionCompilationDto;
}) {
  return (
    <TableRow className="border-0 hover:bg-muted/30">
      <TableCell className="py-2 pl-4">
        {compilation.testCase.name}
      </TableCell>
      <TableCell className="py-2">
        <Badge variant="outline" className="text-xs">
          {compilation.testCase.category}
        </Badge>
      </TableCell>
      <TableCell className="py-2">
        <CompilationStatusBadge status={compilation.status} />
      </TableCell>
      <TableCell className="py-2 text-muted-foreground text-sm">
        {formatCompileTime(compilation)}
      </TableCell>
    </TableRow>
  );
}

export function SubmissionsTable({ submissions }: SubmissionsTableProps) {
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

  if (submissions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No submissions yet. Upload a compiler to get started.
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
          <TableHead>Compile Status</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Submitted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {submissions.map((submission) => (
          <>
            <TableRow
              key={submission.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => toggleRow(submission.id)}
            >
              <TableCell className="w-10">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  {expandedRows.has(submission.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </TableCell>
              <TableCell className="font-medium">
                {submission.teamName}
              </TableCell>
              <TableCell>v{submission.version}</TableCell>
              <TableCell>
                <CompileStatusBadge status={submission.compileStatus} />
              </TableCell>
              <TableCell>{submission.totalScore}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatDistanceToNow(new Date(submission.submittedAt), {
                  addSuffix: true,
                })}
              </TableCell>
            </TableRow>
            {expandedRows.has(submission.id) && (
              <TableRow key={`${submission.id}-expanded`}>
                <TableCell colSpan={6} className="p-0 border-0">
                  <div className="pl-10 pr-4">
                    <div className="flex justify-end py-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to="/submissions/$submissionId"
                          params={{ submissionId: submission.id }}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View Details
                        </Link>
                      </Button>
                    </div>
                    <CompilationsContent submissionId={submission.id} />
                  </div>
                </TableCell>
              </TableRow>
            )}
          </>
        ))}
      </TableBody>
    </Table>
  );
}
