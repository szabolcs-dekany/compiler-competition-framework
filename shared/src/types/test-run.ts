import { TestRunStatus } from './enums';

export interface TestRunDto {
  id: string;
  submissionId: string;
  testCaseId: string;
  status: TestRunStatus;
  output: string | null;
  score: number;
  executionTime: number | null;
  memoryUsage: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TestRunWithDetailsDto extends TestRunDto {
  testCase: {
    id: string;
    name: string;
    category: string;
    points: number;
  };
}
