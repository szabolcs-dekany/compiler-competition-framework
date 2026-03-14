import { SubmissionStatus } from './enums.js';
import type { TestRunDto } from './test-run.js';

export interface SubmissionDto {
  id: string;
  teamId: string;
  teamName: string;
  version: number;
  compilerPath: string | null;
  status: SubmissionStatus;
  submittedAt: string;
  totalScore: number;
}

export interface SubmissionWithTestRunsDto extends SubmissionDto {
  testRuns: TestRunDto[];
}

export interface CreateSubmissionDto {
  teamId: string;
}
