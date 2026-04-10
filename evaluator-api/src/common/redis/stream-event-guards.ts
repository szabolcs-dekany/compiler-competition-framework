import type { BuildLogEvent, CompileLogEvent } from '@evaluator/shared';

const BUILD_STATUSES = new Set(['PENDING', 'BUILDING', 'SUCCESS', 'FAILED']);
const SUBMISSION_STATUSES = new Set([
  'PENDING',
  'BUILDING',
  'READY',
  'EVALUATING',
  'COMPLETED',
  'FAILED',
]);
const COMPILE_STATUSES = new Set(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED']);
const COMPILATION_STATUSES = new Set([
  'PENDING',
  'IN_PROGRESS',
  'SUCCESS',
  'FAILED',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || typeof value === 'number';
}

function isDockerfileVersionDto(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.dockerfileId === 'string' &&
    typeof value.version === 'number' &&
    typeof value.size === 'number' &&
    typeof value.checksum === 'string' &&
    typeof value.uploadedAt === 'string' &&
    typeof value.buildStatus === 'string' &&
    BUILD_STATUSES.has(value.buildStatus) &&
    isOptionalString(value.buildLogS3Key) &&
    isOptionalString(value.buildStartedAt) &&
    isOptionalString(value.buildCompletedAt) &&
    isOptionalString(value.buildError)
  );
}

function isSubmissionDto(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.teamId === 'string' &&
    typeof value.teamName === 'string' &&
    typeof value.version === 'number' &&
    typeof value.originalName === 'string' &&
    typeof value.extension === 'string' &&
    isOptionalString(value.compilerPath) &&
    typeof value.status === 'string' &&
    SUBMISSION_STATUSES.has(value.status) &&
    typeof value.submittedAt === 'string' &&
    typeof value.totalScore === 'number' &&
    typeof value.compileStatus === 'string' &&
    COMPILE_STATUSES.has(value.compileStatus) &&
    isOptionalString(value.compileLogS3Key) &&
    isOptionalString(value.compileStartedAt) &&
    isOptionalString(value.compileCompletedAt) &&
    isOptionalString(value.compileError)
  );
}

function isSubmissionCompilationDto(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.submissionId === 'string' &&
    typeof value.testCaseId === 'string' &&
    typeof value.status === 'string' &&
    COMPILATION_STATUSES.has(value.status) &&
    isOptionalString(value.errorMessage) &&
    isOptionalString(value.startedAt) &&
    isOptionalString(value.completedAt) &&
    isRecord(value.testCase) &&
    typeof value.testCase.id === 'string' &&
    typeof value.testCase.name === 'string' &&
    typeof value.testCase.category === 'string' &&
    isOptionalNumber(value.testCase.points) &&
    typeof value.testCase.points === 'number'
  );
}

export function isBuildLogEvent(value: unknown): value is BuildLogEvent {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'log') {
    return typeof value.message === 'string';
  }

  if (value.type === 'status' || value.type === 'complete') {
    return isDockerfileVersionDto(value.version);
  }

  return false;
}

export function isCompileLogEvent(value: unknown): value is CompileLogEvent {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'log') {
    return typeof value.message === 'string';
  }

  if (value.type === 'compilation-status') {
    return isSubmissionCompilationDto(value.compilation);
  }

  if (value.type === 'status' || value.type === 'complete') {
    return isSubmissionDto(value.submission);
  }

  return false;
}
