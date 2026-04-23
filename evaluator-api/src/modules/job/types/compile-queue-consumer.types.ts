export interface CompilationContext {
  submissionId: string;
  teamId: string;
  version: number;
  jobId: string;
  tempDir: string;
  scratchDir: string;
}

export interface SubmissionSnapshot {
  id: string;
  teamId: string;
  version: number;
  originalName: string;
  compilerPath: string | null;
  dockerImageName: string | null;
  compilations: SnapshotCompilation[];
}

export interface SnapshotCompilation {
  id: string;
  testCaseId: string;
  originalName: string;
  workspaceName: string;
  s3Key: string;
}

export interface CompilationResult {
  compileTimeMs: number;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CompletedCompilation {
  compilationId: string;
  succeeded: boolean;
}

export interface TeamLock {
  key: string;
  value: string;
}

export interface TeamLockHeartbeat {
  stop: () => void;
  throwIfLockLost: () => void;
}
