export interface SourceFileDto {
  id: string;
  teamId: string;
  testCaseId: string;
  originalName: string;
  extension: string;
  size: number;
  checksum: string;
  version: number;
  uploadedAt: string;
  s3Key: string;
}

export interface SourceFileWithTestDetails extends SourceFileDto {
  testCaseName: string;
  testCaseCategory: string;
}

export interface SourceFileListDto {
  teamId: string;
  sourceFiles: SourceFileWithTestDetails[];
  totalTestCases: number;
  uploadedCount: number;
  missingTestCases: string[];
}

export interface UploadSourceFileDto {
  teamId: string;
  testCaseId: string;
}

export interface SourceFileVersionDto {
  id: string;
  sourceFileId: string;
  version: number;
  size: number;
  checksum: string;
  uploadedAt: string;
}
