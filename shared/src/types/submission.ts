import type { SubmissionCompilationDto } from "./compilation.js";
import { SubmissionStatus, CompileStatus } from "./enums.js";

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

export interface CompileLogLineEvent {
  type: "log";
  message: string;
}

export interface CompileStatusEvent {
  type: "status";
  submission: SubmissionDto;
}

export interface CompilationStatusEvent {
  type: "compilation-status";
  compilation: SubmissionCompilationDto;
}

export interface CompileCompleteEvent {
  type: "complete";
  submission: SubmissionDto;
}

export type CompileLogEvent =
  | CompileLogLineEvent
  | CompileStatusEvent
  | CompilationStatusEvent
  | CompileCompleteEvent;
