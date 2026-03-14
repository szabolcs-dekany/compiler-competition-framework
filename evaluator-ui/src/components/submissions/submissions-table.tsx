import type { SubmissionDto } from '@evaluator/shared';
import { SubmissionStatus } from '@evaluator/shared';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDistanceToNow } from 'date-fns';

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

export function SubmissionsTable({ submissions }: SubmissionsTableProps) {
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
          <TableHead>Team</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Submitted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {submissions.map((submission) => (
          <TableRow key={submission.id}>
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
        ))}
      </TableBody>
    </Table>
  );
}
