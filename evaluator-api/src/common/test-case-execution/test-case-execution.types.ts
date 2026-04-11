import type { TestCaseInputs } from '../test-case-loader/test-case-loader.types';

export type AttemptValidationMode = 'EXPECTED_STDOUT' | 'VALIDATOR';

export interface GeneratedAttempt {
  attemptIndex: number;
  seed: string;
  generatedInputs: TestCaseInputs;
  stdin: string | null;
  validationMode: AttemptValidationMode;
  expectedStdout: string | null;
  expectedExitCode: number;
}

export interface TestRunSummary {
  status: 'PASSED' | 'FAILED' | 'TIMEOUT' | 'ERROR';
  runSuccess: boolean;
  runTimeMs: number | null;
  actualStdout: string | null;
  actualStderr: string | null;
  expectedStdout: string | null;
  expectedExitCode: number | null;
  actualExitCode: number | null;
  pointsEarned: number;
  bonusEarned: number;
  errorMessage: string | null;
  passedAttempts: number;
  attemptCount: number;
}

export interface CompletedAttemptResult {
  validationMode: AttemptValidationMode;
  expectedStdout: string | null;
  expectedExitCode: number;
  actualStdout: string | null;
  actualStderr: string | null;
  actualExitCode: number | null;
  runTimeMs: number | null;
  passed: boolean | null;
  errorMessage: string | null;
}
