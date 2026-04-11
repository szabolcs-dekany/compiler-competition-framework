import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import bull from 'bull';
import { EvaluateJobData } from '../job/dto/jobs.dto';

@Injectable()
export class EvaluateQueueService {
  private readonly logger = new Logger(EvaluateQueueService.name);

  constructor(@InjectQueue('evaluate') private evaluateQueue: bull.Queue) {}

  async dispatchEvaluateJob(
    evaluateJob: EvaluateJobData,
    opts?: { jobKeySuffix?: string },
  ): Promise<string> {
    const jobId = [
      'evaluate',
      evaluateJob.submissionId,
      evaluateJob.compilationId,
      opts?.jobKeySuffix,
    ]
      .filter(
        (part): part is string => typeof part === 'string' && part.length > 0,
      )
      .join('-');
    const job = await this.evaluateQueue.add('', evaluateJob, {
      jobId,
    });

    this.logger.log(
      `Dispatched evaluate job for submission ${evaluateJob.submissionId} compilation ${evaluateJob.compilationId}`,
    );

    return job.id.toString();
  }
}
