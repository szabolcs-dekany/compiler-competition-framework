import type { TestCaseBlueprint } from '@evaluator/shared';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TestCasesTableProps {
  testCases: TestCaseBlueprint[];
}

const difficultyColors = {
  1: 'bg-green-500/10 text-green-500 border-green-500/20',
  2: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  3: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const difficultyLabels = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
};

export function TestCasesTable({ testCases }: TestCasesTableProps) {
  if (testCases.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No test cases available.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">ID</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="w-[100px]">Difficulty</TableHead>
          <TableHead className="w-[80px]">Points</TableHead>
          <TableHead className="w-[120px]">Timeout</TableHead>
          <TableHead className="w-[100px]">Bonus</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {testCases.map((testCase) => (
          <TableRow key={testCase.id}>
            <TableCell className="font-mono text-sm">{testCase.id}</TableCell>
            <TableCell>
              <div>
                <div className="font-medium">{testCase.name}</div>
                <div className="text-sm text-muted-foreground max-w-md truncate">
                  {testCase.description}
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{testCase.category}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={difficultyColors[testCase.difficulty]}>
                {difficultyLabels[testCase.difficulty]}
              </Badge>
            </TableCell>
            <TableCell className="font-medium">{testCase.points}</TableCell>
            <TableCell className="text-muted-foreground">
              {testCase.timeout_ms}ms
            </TableCell>
            <TableCell>
              {testCase.performance_bonus ? (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                  +{Math.floor(testCase.points * 0.2)}
                </Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
