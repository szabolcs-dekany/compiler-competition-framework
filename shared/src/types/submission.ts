import { SubmissionStatus } from './enums';
import type { TestRunDto } from './test-run';

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
