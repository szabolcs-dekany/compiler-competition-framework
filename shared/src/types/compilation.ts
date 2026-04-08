import { CompilationStatus } from './enums.js';

export interface SubmissionCompilationDto {
  id: string;
  submissionId: string;
  testCaseId: string;
  status: CompilationStatus;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  testCase: {
    id: string;
    name: string;
    category: string;
    points: number;
  };
}
