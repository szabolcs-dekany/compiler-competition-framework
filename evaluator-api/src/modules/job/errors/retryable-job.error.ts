export class RetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableJobError';
  }
}
