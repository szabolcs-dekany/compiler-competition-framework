export interface EvaluationContext {
  submissionId: string;
  compilationId: string;
  tempDir: string;
  scratchRootDir: string;
}

export interface CompilationSnapshotSubmission {
  id: string;
  teamId: string;
  dockerImageName: string | null;
}

export interface CompilationSnapshot {
  id: string;
  submissionId: string;
  testCaseId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';
  compiledS3Key: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  submission: CompilationSnapshotSubmission;
}
