import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  SubmissionDto,
  SubmissionCompilationDto,
} from "@evaluator/shared";
import { CompileStatus, CompilationStatus } from "@evaluator/shared";
import { useSubmissionCompileStream } from "@/lib/hooks/use-submission-compile-stream";
import { submissionQueries } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SubmissionsTableProps {
  submissions: SubmissionDto[];
}

type StatusConfigItem = {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  extraClassName?: string;
};

type StatusConfig = {
  pending: StatusConfigItem;
  running: StatusConfigItem;
  success: StatusConfigItem;
  failed: StatusConfigItem;
};

function StatusBadge({
  statusKey,
  config,
}: {
  statusKey: "pending" | "running" | "success" | "failed";
  config: StatusConfig;
}) {
  const {
    label,
    variant,
    icon: Icon,
    iconClassName,
    extraClassName,
  } = config[statusKey];
  return (
    <Badge
      variant={variant}
      className={`gap-1${extraClassName ? ` ${extraClassName}` : ""}`}
    >
      <Icon className={`h-3 w-3${iconClassName ? ` ${iconClassName}` : ""}`} />
      {label}
    </Badge>
  );
}

function resolveCompileStatus(
  status: CompileStatus,
): "pending" | "running" | "success" | "failed" {
  if (status === CompileStatus.PENDING) return "pending";
  if (status === CompileStatus.RUNNING) return "running";
  if (status === CompileStatus.SUCCESS) return "success";
  return "failed";
}

const compileStatusConfig: StatusConfig = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  running: {
    label: "Running",
    variant: "default",
    icon: Loader2,
    iconClassName: "animate-spin",
  },
  success: {
    label: "Success",
    variant: "default",
    icon: CheckCircle,
    extraClassName: "bg-green-600 hover:bg-green-700",
  },
  failed: { label: "Failed", variant: "destructive", icon: XCircle },
};

function CompileStatusBadge({ status }: { status: CompileStatus }) {
  return (
    <StatusBadge
      statusKey={resolveCompileStatus(status)}
      config={compileStatusConfig}
    />
  );
}

function resolveCompilationStatus(
  status: CompilationStatus,
): "pending" | "running" | "success" | "failed" {
  if (status === CompilationStatus.PENDING) return "pending";
  if (status === CompilationStatus.IN_PROGRESS) return "running";
  if (status === CompilationStatus.SUCCESS) return "success";
  return "failed";
}

const compilationStatusConfig: StatusConfig = {
  pending: {
    label: "Pending",
    variant: "secondary",
    icon: Clock,
    extraClassName: "text-xs",
  },
  running: {
    label: "In Progress",
    variant: "default",
    icon: Loader2,
    iconClassName: "animate-spin",
    extraClassName: "text-xs",
  },
  success: {
    label: "Success",
    variant: "default",
    icon: CheckCircle,
    extraClassName: "text-xs bg-green-600 hover:bg-green-700",
  },
  failed: {
    label: "Failed",
    variant: "destructive",
    icon: XCircle,
    extraClassName: "text-xs",
  },
};

function CompilationStatusBadge({ status }: { status: CompilationStatus }) {
  return (
    <StatusBadge
      statusKey={resolveCompilationStatus(status)}
      config={compilationStatusConfig}
    />
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
    return "-";
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
      <TableCell className="py-2 pl-4">{compilation.testCase.name}</TableCell>
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

function SubmissionTableRow({
  submission,
  expanded,
  onToggle,
}: {
  submission: SubmissionDto;
  expanded: boolean;
  onToggle: () => void;
}) {
  useSubmissionCompileStream({
    submissionId: submission.id,
    submissionStatus: submission.status,
    enabled: expanded,
  });

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
        <TableCell className="font-medium">{submission.teamName}</TableCell>
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
      {expanded && (
        <TableRow>
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
          <SubmissionTableRow
            key={submission.id}
            submission={submission}
            expanded={expandedRows.has(submission.id)}
            onToggle={() => toggleRow(submission.id)}
          />
        ))}
      </TableBody>
    </Table>
  );
}
