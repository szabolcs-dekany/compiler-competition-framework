export type BuildStatus = "PENDING" | "BUILDING" | "SUCCESS" | "FAILED";

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

export interface BuildLogLineEvent {
  type: "log";
  message: string;
}

export interface BuildStatusEvent {
  type: "status";
  version: DockerfileVersionDto;
}

export interface BuildCompleteEvent {
  type: "complete";
  version: DockerfileVersionDto;
}

export type BuildLogEvent =
  | BuildLogLineEvent
  | BuildStatusEvent
  | BuildCompleteEvent;
