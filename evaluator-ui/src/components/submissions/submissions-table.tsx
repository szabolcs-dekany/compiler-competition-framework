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

/**
 * Render a status Badge with an icon and label for the given compile status.
 *
 * @param status - The compile status to display (e.g., `PENDING`, `RUNNING`, `SUCCESS`, or other failure statuses)
 * @returns The Badge element corresponding to `status`
 */
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

/**
 * Render a compact badge showing a compilation status with an icon and label.
 *
 * @param status - The compilation status to display
 * @returns A badge JSX element with an icon and text corresponding to `status`
 */
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

/**
 * Render a list of compilations for a given submission.
 *
 * Fetches compilations for the provided submission id and displays one of:
 * - A centered loading indicator while the query is loading
 * - A centered "No compilations yet" message when there are no compilations
 * - A table of compilation rows when compilations are available
 *
 * @param submissionId - The submission identifier used to fetch its compilations
 * @returns The compilation list UI (loading, empty state, or table of compilations)
 */
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

/**
 * Format a compilation's duration as a milliseconds string.
 *
 * @param compilation - Compilation object containing `startedAt` and `completedAt` timestamps
 * @returns `"-"` if `startedAt` or `completedAt` is missing, otherwise the elapsed time as a string like `"123ms"`
 */
function formatCompileTime(compilation: SubmissionCompilationDto): string {
  if (!compilation.startedAt || !compilation.completedAt) {
    return '-';
  }
  const ms =
    new Date(compilation.completedAt).getTime() -
    new Date(compilation.startedAt).getTime();
  return `${ms}ms`;
}

/**
 * Renders a table row summarizing a single compilation entry.
 *
 * Displays the test case name, a category badge, the compilation status badge, and the formatted compile time.
 *
 * @param compilation - The compilation record to render (includes test case details, status, and timestamps)
 * @returns A table row element containing cells for test case name, category, status, and compile time
 */
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

/**
 * Render a table of submissions with expandable rows that reveal compilation details for each submission.
 *
 * @param submissions - List of submission records to display; each row shows team, version, compile status, score, and submitted time.
 * @returns A table element where each submission row can be expanded to show a "View Details" link and its compilations.
 */
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
