export interface CompileJobData {
  submissionId: string;
  teamId: string;
  version: number;
}

export interface DockerBuildJobData {
  dockerfileId: string;
  teamId: string;
  version: number;
}

export interface EvaluateJobData {
  submissionId: string;
  compilationId: string;
}

export interface CleanupJobData {
  submissionId: string;
  imageId?: string;
}
