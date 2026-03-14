import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { teamQueries, sourceFileQueries, testCaseQueries } from '@/lib/queries';
import { SourceFilesGrid } from '@/components/source-files/source-files-grid';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Upload, CheckCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export function TeamDetailPage() {
  const { teamId } = useParams({ from: '/teams/$teamId' });
  const { data: team } = useSuspenseQuery(teamQueries.detail(teamId));
  const { data: sourceFilesData } = useSuspenseQuery(sourceFileQueries.list(teamId));
  const { data: testCases } = useSuspenseQuery(testCaseQueries.list());

  const progressPercent =
    sourceFilesData.totalTestCases > 0
      ? Math.round(
          (sourceFilesData.uploadedCount / sourceFilesData.totalTestCases) * 100
        )
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/teams">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{team.name}</h1>
          <p className="text-muted-foreground">Manage source files for test cases</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Source Files Progress
          </CardTitle>
          <CardDescription>
            Upload source files for each test case. Files are stored by test case ID and can be
            replaced at any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>
                {sourceFilesData.uploadedCount} of {sourceFilesData.totalTestCases} test cases
              </span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} />
            {sourceFilesData.missingTestCases.length > 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Missing: {sourceFilesData.missingTestCases.slice(0, 5).join(', ')}
                {sourceFilesData.missingTestCases.length > 5 &&
                  ` +${sourceFilesData.missingTestCases.length - 5} more`}
              </p>
            )}
            {sourceFilesData.uploadedCount === sourceFilesData.totalTestCases &&
              sourceFilesData.totalTestCases > 0 && (
                <div className="flex items-center gap-2 text-green-600 text-sm mt-2">
                  <CheckCircle className="h-4 w-4" />
                  All source files uploaded
                </div>
              )}
          </div>
        </CardContent>
      </Card>

      <SourceFilesGrid sourceFilesData={sourceFilesData} testCases={testCases} />
    </div>
  );
}
