import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import type { SubmissionDto } from '@evaluator/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { CompileQueueService } from '../queue/compile-queue.service';
import { EvaluateQueueService } from '../queue/evaluate-queue.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { Submission } from './entities/submission.entity';
import { SubmissionEventsService } from './submission-events.service';
import { SubmissionReaderService } from './submission-reader.service';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly compileQueueService: CompileQueueService,
    private readonly evaluateQueueService: EvaluateQueueService,
    private readonly submissionEventsService: SubmissionEventsService,
    private readonly submissionReaderService: SubmissionReaderService,
  ) {}

  async create(
    createSubmissionDto: CreateSubmissionDto,
    file: Express.Multer.File,
  ): Promise<Submission> {
    const team = await this.prisma.team.findUnique({
      where: { id: createSubmissionDto.teamId },
      include: {
        submissions: { orderBy: { version: 'desc' }, take: 1 },
        dockerfile: {
          include: {
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
            },
          },
        },
        sourceFiles: {
          orderBy: { testCaseId: 'asc' },
          include: {
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException(
        `Team with id ${createSubmissionDto.teamId} not found`,
      );
    }

    const nextVersion =
      team.submissions.length > 0 ? team.submissions[0].version + 1 : 1;
    const originalName = file.originalname || 'compiler';
    const extension = path.extname(originalName) || '';
    const dockerfileVersion = team.dockerfile?.versions.at(0) ?? null;
    const dockerImageName =
      dockerfileVersion?.buildStatus === 'SUCCESS'
        ? (dockerfileVersion.imageName ?? team.dockerfile?.imageName ?? null)
        : null;

    if (!dockerImageName) {
      throw new BadRequestException(
        `No built Docker image is available for team ${createSubmissionDto.teamId}`,
      );
    }

    const sourceFileVersionIds = team.sourceFiles
      .map((sourceFile) => sourceFile.versions.at(0)?.id ?? null)
      .filter(
        (sourceFileVersionId): sourceFileVersionId is string =>
          typeof sourceFileVersionId === 'string',
      );

    const submission = await this.prisma.submission.create({
      data: {
        teamId: createSubmissionDto.teamId,
        dockerfileId: team.dockerfile?.id ?? null,
        dockerfileVersion: dockerfileVersion?.version ?? null,
        dockerImageName,
        version: nextVersion,
        originalName,
        extension,
        compilerPath: null,
      },
      include: {
        team: {
          select: {
            name: true,
          },
        },
      },
    });

    const key = `compilers/${createSubmissionDto.teamId}/${submission.id}${extension}`;

    try {
      await this.storage.uploadFile(key, file.buffer, file.mimetype);

      if (sourceFileVersionIds.length > 0) {
        await this.prisma.compilation.createMany({
          data: sourceFileVersionIds.map((sourceFileVersionId) => ({
            sourceFileVersionId,
            submissionId: submission.id,
          })),
        });
      }

      const updatedSubmission = await this.prisma.submission.update({
        where: { id: submission.id },
        data: { compilerPath: key },
        include: {
          team: {
            select: {
              name: true,
            },
          },
        },
      });

      await this.compileQueueService.dispatchCompileJob({
        submissionId: submission.id,
        teamId: team.id,
        version: nextVersion,
      });

      return {
        ...updatedSubmission,
        teamName: updatedSubmission.team.name,
      };
    } catch (error) {
      await this.prisma.submission.delete({ where: { id: submission.id } });
      throw error;
    }
  }

  async findAll(): Promise<Submission[]> {
    const submissions = await this.prisma.submission.findMany({
      orderBy: {
        submittedAt: 'desc',
      },
      include: {
        team: {
          select: {
            name: true,
          },
        },
      },
    });

    return submissions.map((submission) => ({
      ...submission,
      teamName: submission.team.name,
    }));
  }

  async findByTeam(teamId: string): Promise<Submission[]> {
    const submissions = await this.prisma.submission.findMany({
      where: { teamId },
      orderBy: {
        version: 'desc',
      },
      include: {
        team: {
          select: {
            name: true,
          },
        },
      },
    });

    return submissions.map((submission) => ({
      ...submission,
      teamName: submission.team.name,
    }));
  }

  async findOne(id: string): Promise<Submission | null> {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!submission) {
      return null;
    }

    return {
      ...submission,
      teamName: submission.team.name,
    };
  }

  async rerunEvaluations(submissionId: string): Promise<SubmissionDto> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        compilations: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException(
        `Submission with id ${submissionId} not found`,
      );
    }

    if (submission.compileStatus === 'RUNNING') {
      throw new BadRequestException(
        'Cannot rerun evaluations while compilation is still running',
      );
    }

    const compilationsToEvaluate = submission.compilations.filter(
      (compilation) =>
        compilation.status === 'SUCCESS' || compilation.status === 'FAILED',
    );

    if (compilationsToEvaluate.length === 0) {
      throw new BadRequestException(
        'No completed compilation results are available to evaluate',
      );
    }

    const testRuns = await this.prisma.testRun.findMany({
      where: { submissionId },
      select: { id: true },
    });
    const testRunIds = testRuns.map((testRun) => testRun.id);
    const nextStatus =
      submission.compileStatus === 'FAILED' ? 'FAILED' : 'READY';

    await this.prisma.$transaction(async (tx) => {
      if (testRunIds.length > 0) {
        await tx.testRunAttempt.updateMany({
          where: {
            testRunId: {
              in: testRunIds,
            },
          },
          data: {
            actualStdout: null,
            actualStderr: null,
            actualExitCode: null,
            runTimeMs: null,
            passed: null,
            errorMessage: null,
            completedAt: null,
          },
        });
      }

      await tx.testRun.updateMany({
        where: { submissionId },
        data: {
          status: 'PENDING',
          runSuccess: null,
          runTimeMs: null,
          actualStdout: null,
          actualStderr: null,
          expectedStdout: null,
          expectedExitCode: null,
          actualExitCode: null,
          pointsEarned: 0,
          bonusEarned: 0,
          errorMessage: null,
          completedAt: null,
        },
      });

      await tx.submission.update({
        where: { id: submissionId },
        data: {
          status: nextStatus,
          totalScore: 0,
        },
      });
    });

    await this.submissionEventsService.publishSubmissionEvent(
      submissionId,
      'status',
    );

    const rerunKey = `rerun-${Date.now()}`;
    for (const compilation of compilationsToEvaluate) {
      await this.evaluateQueueService.dispatchEvaluateJob(
        {
          submissionId,
          compilationId: compilation.id,
        },
        {
          jobKeySuffix: rerunKey,
        },
      );
    }

    return this.submissionReaderService.getSubmissionDto(submissionId);
  }
}
