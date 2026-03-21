export type BuildStatus = 'PENDING' | 'BUILDING' | 'SUCCESS' | 'FAILED';

export interface DockerfileDto {
  id: string;
  teamId: string;
  originalName: string;
  size: number;
  checksum: string;
  version: number;
  uploadedAt: string;
  s3Key: string;
  imageName?: string | null;
}

export interface DockerfileListDto {
  id: string;
  teamId: string;
  teamName: string;
  size: number;
  checksum: string;
  version: number;
  uploadedAt: string;
}

export interface DockerfileVersionDto {
  id: string;
  dockerfileId: string;
  version: number;
  size: number;
  checksum: string;
  uploadedAt: string;
  buildStatus: BuildStatus;
  buildLogS3Key?: string | null;
  buildStartedAt?: string | null;
  buildCompletedAt?: string | null;
  buildError?: string | null;
}

export interface BuildLogEvent {
  type: 'log' | 'status' | 'complete' | 'error';
  message?: string;
  status?: BuildStatus;
}
