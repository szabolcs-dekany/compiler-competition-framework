import { Injectable, Logger } from '@nestjs/common';
import { CompileJobData } from '../job/dto/jobs.dto';
import bull from 'bull';
import { InjectQueue } from '@nestjs/bull';

@Injectable()
export class CompileQueueService {
  private readonly logger = new Logger(CompileQueueService.name);

  constructor(@InjectQueue('compile') private compileQueue: bull.Queue) {}

  async dispatchCompileJob(compileJob: CompileJobData): Promise<string> {
    const job = await this.compileQueue.add('', compileJob, {
      jobId: `compile-${compileJob.submissionId}`,
    });

    this.logger.log(
      `Dispatched build job for submission ${compileJob.submissionId}`,
    );

    return job.id.toString();
  }
}
