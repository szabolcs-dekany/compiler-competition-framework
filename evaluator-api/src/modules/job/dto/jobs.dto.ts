export interface CompileJobData {
  submissionId: string;
  teamId: string;
}

export interface DockerBuildJobData {
  dockerfileId: string;
  teamId: string;
  version: number;
}

export interface EvaluateJobData {
  submissionId: string;
  testCaseId: string;
}

export interface CleanupJobData {
  submissionId: string;
  imageId?: string;
}
