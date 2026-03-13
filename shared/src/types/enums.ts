export enum SubmissionStatus {
  PENDING = 'PENDING',
  BUILDING = 'BUILDING',
  READY = 'READY',
  FAILED = 'FAILED',
}

export enum TestRunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
  ERROR = 'ERROR',
}
