import { TestRunStatus } from './enums';

export interface TestRunDto {
  id: string;
  submissionId: string;
  testCaseId: string;
  status: TestRunStatus;
  compileSuccess: boolean | null;
  compileTimeMs: number | null;
  runSuccess: boolean | null;
  runTimeMs: number | null;
  actualStdout: string | null;
  actualStderr: string | null;
  expectedStdout: string | null;
  expectedExitCode: number | null;
  actualExitCode: number | null;
  pointsEarned: number;
  bonusEarned: number;
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
