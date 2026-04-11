import { TestRunStatus } from './enums.js';

export type TestRunValidationMode = 'EXPECTED_STDOUT' | 'VALIDATOR';

export interface TestRunAttemptDto {
  id: string;
  testRunId: string;
  attemptIndex: number;
  seed: string;
  generatedInputs: Record<string, number | string>;
  stdin: string | null;
  validationMode: TestRunValidationMode;
  expectedStdout: string | null;
  expectedExitCode: number;
  actualStdout: string | null;
  actualStderr: string | null;
  actualExitCode: number | null;
  runTimeMs: number | null;
  passed: boolean | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TestRunDto {
  id: string;
  submissionId: string;
  testCaseId: string;
  compilationId: string | null;
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
  attemptCount: number;
  passedAttempts: number;
  createdAt: string;
  completedAt: string | null;
  testCase: {
    id: string;
    name: string;
    category: string;
    points: number;
  };
}
