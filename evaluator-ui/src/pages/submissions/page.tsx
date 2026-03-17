import { useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { submissionQueries, teamQueries, dockerfileQueries } from '@/lib/queries';
import { SubmissionsTable } from '@/components/submissions/submissions-table';
import { CreateSubmissionDialog } from '@/components/submissions/create-submission-dialog';
import { DockerfilesTable } from '@/components/dockerfiles/dockerfiles-table';
import { UploadDockerfileDialog } from '@/components/dockerfiles/upload-dockerfile-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SubmissionsPage() {
  const [dockerfileDialogOpen, setDockerfileDialogOpen] = useState(false);

  const { data: submissions } = useSuspenseQuery(submissionQueries.list());
  const { data: dockerfiles } = useSuspenseQuery(dockerfileQueries.list());
  useSuspenseQuery(teamQueries.list());

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Submissions</h1>

<Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Execution Environments</CardTitle>
            <CardDescription>
              {dockerfiles.length} dockerfile{dockerfiles.length !== 1 ? 's' : ''} uploaded
            </CardDescription>
          </div>
          <Button onClick={() => setDockerfileDialogOpen(true)}>Upload Dockerfile</Button>
        </CardHeader>
        <CardContent>
          <DockerfilesTable dockerfiles={dockerfiles} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Compilers</CardTitle>
            <CardDescription>
              {submissions.length} compiler{submissions.length !== 1 ? 's' : ''} submitted
            </CardDescription>
          </div>
          <CreateSubmissionDialog>
            <Button>Submit Compiler</Button>
          </CreateSubmissionDialog>
        </CardHeader>
        <CardContent>
          <SubmissionsTable submissions={submissions} />
        </CardContent>
      </Card>

      <UploadDockerfileDialog
        open={dockerfileDialogOpen}
        onOpenChange={setDockerfileDialogOpen}
      />
    </div>
  );
}
