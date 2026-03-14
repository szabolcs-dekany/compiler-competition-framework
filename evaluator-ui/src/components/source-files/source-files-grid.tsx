import type { SourceFileListDto, TestCaseBlueprint } from '@evaluator/shared';
import { SourceFileCard } from './source-file-card';

function groupByCategory(testCases: TestCaseBlueprint[]): Record<string, TestCaseBlueprint[]> {
  return testCases.reduce(
    (acc, testCase) => {
      const category = testCase.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(testCase);
      return acc;
    },
    {} as Record<string, TestCaseBlueprint[]>
  );
}

interface SourceFilesGridProps {
  sourceFilesData: SourceFileListDto;
  testCases: TestCaseBlueprint[];
}

export function SourceFilesGrid({ sourceFilesData, testCases }: SourceFilesGridProps) {
  const sourceFileMap = new Map(
    sourceFilesData.sourceFiles.map((sf) => [sf.testCaseId, sf])
  );

  const groupedTestCases = groupByCategory(testCases);

  return (
    <div className="space-y-8">
      {Object.entries(groupedTestCases).map(([category, categoryTestCases]) => (
        <div key={category}>
          <h3 className="text-lg font-semibold mb-4 capitalize">{category}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {categoryTestCases.map((testCase) => (
              <SourceFileCard
                key={testCase.id}
                testCase={testCase}
                sourceFile={sourceFileMap.get(testCase.id)}
                teamId={sourceFilesData.teamId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
