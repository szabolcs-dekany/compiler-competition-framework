import { useSuspenseQuery } from '@tanstack/react-query';
import { testCaseQueries } from '@/lib/queries';
import { TestCasesTable } from '@/components/test-cases/test-cases-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function TestCasesPage() {
  const { data: testCases } = useSuspenseQuery(testCaseQueries.list());

  const totalPoints = testCases.reduce((sum, tc) => sum + tc.points, 0);
  const bonusPoints = testCases
    .filter((tc) => tc.performance_bonus)
    .reduce((sum, tc) => sum + Math.floor(tc.points * 0.2), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Test Cases</h1>
        <p className="text-muted-foreground">Available test cases for evaluation</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Tests</CardDescription>
            <CardTitle className="text-3xl">{testCases.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Base Points</CardDescription>
            <CardTitle className="text-3xl">{totalPoints}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bonus Available</CardDescription>
            <CardTitle className="text-3xl">+{bonusPoints}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Test Cases</CardTitle>
          <CardDescription>
            {testCases.length} test case{testCases.length !== 1 ? 's' : ''} available
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TestCasesTable testCases={testCases} />
        </CardContent>
      </Card>
    </div>
  );
}
