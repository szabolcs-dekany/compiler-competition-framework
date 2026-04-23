export interface CompilationFailureResultInput {
  submissionId: string;
  compilationId: string;
  testCaseId: string;
  compileTimeMs: number | null;
  errorMessage: string;
}

export interface EnsureEvaluationTestRunInput {
  submissionId: string;
  compilationId: string;
  testCaseId: string;
  compileTimeMs: number | null;
}

export interface EvaluationFailureInput {
  submissionId: string;
  compilationId: string;
  testCaseId: string;
  errorMessage: string;
}
