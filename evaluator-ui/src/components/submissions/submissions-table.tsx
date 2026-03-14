import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SubmissionDto, TestRunWithDetailsDto } from '@evaluator/shared';
import { SubmissionStatus, TestRunStatus } from '@evaluator/shared';
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
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface SubmissionsTableProps {
  submissions: SubmissionDto[];
}

const statusColors: Record<SubmissionStatus, string> = {
  [SubmissionStatus.PENDING]: 'bg-gray-500',
  [SubmissionStatus.BUILDING]: 'bg-blue-500',
  [SubmissionStatus.READY]: 'bg-green-500',
  [SubmissionStatus.EVALUATING]: 'bg-yellow-500',
  [SubmissionStatus.COMPLETED]: 'bg-green-600',
  [SubmissionStatus.FAILED]: 'bg-red-500',
};

const testRunStatusColors: Record<TestRunStatus, string> = {
  [TestRunStatus.PENDING]: 'bg-gray-400',
  [TestRunStatus.COMPILING]: 'bg-blue-400',
  [TestRunStatus.RUNNING]: 'bg-yellow-400',
  [TestRunStatus.PASSED]: 'bg-green-500',
  [TestRunStatus.FAILED]: 'bg-red-400',
  [TestRunStatus.TIMEOUT]: 'bg-orange-400',
  [TestRunStatus.ERROR]: 'bg-red-600',
};

function TestRunsRow({ submissionId }: { submissionId: string }) {
  const { data: testRuns, isLoading } = useQuery(submissionQueries.testRuns(submissionId));

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="text-center py-4">
          <Loader2 className="inline w-4 h-4 animate-spin mr-2" />
          Loading test runs...
        </TableCell>
      </TableRow>
    );
  }

  if (!testRuns || testRuns.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
          No test runs yet
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      <TableRow className="bg-muted/50">
        <TableCell className="font-medium text-xs text-muted-foreground">Test Case</TableCell>
        <TableCell className="font-medium text-xs text-muted-foreground">Category</TableCell>
        <TableCell className="font-medium text-xs text-muted-foreground">Status</TableCell>
        <TableCell className="font-medium text-xs text-muted-foreground">
          Points (earned / max)
        </TableCell>
        <TableCell className="font-medium text-xs text-muted-foreground">Time</TableCell>
      </TableRow>
      {testRuns.map((tr) => (
        <TestRunDetailRow key={tr.id} testRun={tr} />
      ))}
    </>
  );
}

function TestRunDetailRow({ testRun }: { testRun: TestRunWithDetailsDto }) {
  const totalEarned = testRun.pointsEarned + testRun.bonusEarned;

  return (
    <TableRow className="bg-muted/30">
      <TableCell className="pl-8">{testRun.testCase.name}</TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {testRun.testCase.category}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge className={cn('text-xs', testRunStatusColors[testRun.status])}>
          {testRun.status}
        </Badge>
      </TableCell>
      <TableCell>
        <span className={cn(totalEarned > 0 ? 'text-green-600' : 'text-muted-foreground')}>
          {totalEarned}
        </span>
        {' / '}
        <span className="text-muted-foreground">{testRun.testCase.points}</span>
        {testRun.bonusEarned > 0 && (
          <span className="text-xs text-green-500 ml-1">(+{testRun.bonusEarned} bonus)</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {testRun.runTimeMs ? `${testRun.runTimeMs}ms` : '-'}
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
          <TableHead className="w-8"></TableHead>
          <TableHead>Team</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Status</TableHead>
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
              <TableCell className="w-8">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  {expandedRows.has(submission.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </TableCell>
              <TableCell className="font-medium">{submission.teamName}</TableCell>
              <TableCell>v{submission.version}</TableCell>
              <TableCell>
                <Badge className={statusColors[submission.status]}>
                  {submission.status}
                </Badge>
              </TableCell>
              <TableCell>{submission.totalScore}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatDistanceToNow(new Date(submission.submittedAt), { addSuffix: true })}
              </TableCell>
            </TableRow>
            {expandedRows.has(submission.id) && (
              <TestRunsRow submissionId={submission.id} />
            )}
          </>
        ))}
      </TableBody>
    </Table>
  );
}
