import { SubmissionStatus, CompileStatus } from './enums.js';

export interface SubmissionDto {
  id: string;
  teamId: string;
  teamName: string;
  version: number;
  originalName: string;
  extension: string;
  compilerPath: string | null;
  status: SubmissionStatus;
  submittedAt: string;
  totalScore: number;
  compileStatus: CompileStatus;
  compileLogS3Key?: string | null;
  compileStartedAt?: string | null;
  compileCompletedAt?: string | null;
  compileError?: string | null;
}

export interface CreateSubmissionDto {
  teamId: string;
}

export interface CompileLogEvent {
  type: 'log' | 'status' | 'complete' | 'error';
  message?: string;
  status?: CompileStatus;
}
