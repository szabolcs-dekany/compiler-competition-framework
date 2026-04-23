export interface CompilationCompletionInput {
  submissionId: string;
  hasSuccessfulCompilation: boolean;
  allFilesCompiled: boolean;
  compileLogS3Key: string;
}

export interface CompilationCrashInput {
  submissionId: string;
  errorMessage: string;
  compileLogS3Key?: string;
}

export interface UpdateCompilationStatusInput {
  s3Key?: string;
  errorMessage?: string | null;
}
