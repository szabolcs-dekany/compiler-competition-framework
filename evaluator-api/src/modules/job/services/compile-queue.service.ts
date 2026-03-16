import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CompileJobData } from '../dto/jobs.dto';

@Injectable()
export class CompileQueueService {
  private readonly logger = new Logger(CompileQueueService.name);

  constructor(@InjectQueue('compile') private compileQueue: Queue) {}

  async dispatchCompileJob(compileJob: CompileJobData): Promise<string> {
    const job = await this.compileQueue.add('compile', compileJob, {
      jobId: `compile-${compileJob.submissionId}`,
    });

    this.logger.log(
      `Dispatched build job for submission ${compileJob.submissionId}`,
    );

    return job.id!;
  }
}
