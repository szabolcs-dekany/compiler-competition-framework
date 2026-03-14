import { useSuspenseQuery } from '@tanstack/react-query';
import { submissionQueries } from '@/lib/queries';
import { SubmissionsTable } from '@/components/submissions/submissions-table';
import { CreateSubmissionDialog } from '@/components/submissions/create-submission-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SubmissionsPage() {
  const { data: submissions } = useSuspenseQuery(submissionQueries.list());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Submissions</h1>
          <p className="text-muted-foreground">Compiler submissions and evaluation results</p>
        </div>
        <CreateSubmissionDialog>
          <Button>Submit Compiler</Button>
        </CreateSubmissionDialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Submissions</CardTitle>
          <CardDescription>
            {submissions.length} submission{submissions.length !== 1 ? 's' : ''} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubmissionsTable submissions={submissions} />
        </CardContent>
      </Card>
    </div>
  );
}
