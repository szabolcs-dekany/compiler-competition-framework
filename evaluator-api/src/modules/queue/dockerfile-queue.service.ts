import { Injectable, Logger } from '@nestjs/common';
import { DockerBuildJobData } from '../job/dto/jobs.dto';
import bull from 'bull';
import { InjectQueue } from '@nestjs/bull';

@Injectable()
export class DockerfileQueueService {
  private readonly logger = new Logger(DockerfileQueueService.name);

  constructor(@InjectQueue('dockerfile') private dockerfileQueue: bull.Queue) {}

  async dispatchDockerfileJob(
    dockerBuildJobData: DockerBuildJobData,
  ): Promise<string> {
    const jobId = `dockerfile-${dockerBuildJobData.dockerfileId}-${dockerBuildJobData.teamId}-${dockerBuildJobData.version}`;
    const job = await this.dockerfileQueue.add('', dockerBuildJobData, {
      jobId: jobId,
    });

    this.logger.log(`Dispatched Dockerfile build job for submission ${jobId}`);

    return job.id.toString();
  }
}
