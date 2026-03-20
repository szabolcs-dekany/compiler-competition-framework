export interface DockerfileDto {
  id: string;
  teamId: string;
  originalName: string;
  size: number;
  checksum: string;
  version: number;
  uploadedAt: string;
  s3Key: string;
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
}
