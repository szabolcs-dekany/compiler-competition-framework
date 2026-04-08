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
  compiledS3Key?: string;
  compiledAt?: string;
  compiledSubmissionVersion?: number;
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
