import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { TestCasesService } from '../test-cases/test-cases.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { Submission } from './entities/submission.entity';
import type { TestRunWithDetailsDto } from '@evaluator/shared';
import { TestRunStatus } from '@evaluator/shared';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly testCasesService: TestCasesService,
  ) {}

  async create(
    createSubmissionDto: CreateSubmissionDto,
    file: Express.Multer.File,
  ): Promise<Submission> {
    const team = await this.prisma.team.findUnique({
      where: { id: createSubmissionDto.teamId },
      include: { submissions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    if (!team) {
      throw new NotFoundException(
        `Team with id ${createSubmissionDto.teamId} not found`,
      );
    }

    const nextVersion =
      team.submissions.length > 0 ? team.submissions[0].version + 1 : 1;

    const submission = await this.prisma.submission.create({
      data: {
        teamId: createSubmissionDto.teamId,
        version: nextVersion,
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

    const key = `compilers/${createSubmissionDto.teamId}/${submission.id}.tar.gz`;

    try {
      await this.storage.uploadFile(key, file.buffer, file.mimetype);

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

    return submissions.map((s) => ({
      ...s,
      teamName: s.team.name,
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

    return submissions.map((s) => ({
      ...s,
      teamName: s.team.name,
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

  async findTestRuns(submissionId: string): Promise<TestRunWithDetailsDto[]> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException(
        `Submission with id ${submissionId} not found`,
      );
    }

    const allTestCases = this.testCasesService.findAll();

    const testRuns = await this.prisma.testRun.findMany({
      where: { submissionId },
    });

    const testRunMap = new Map(testRuns.map((tr) => [tr.testCaseId, tr]));

    return allTestCases.map((tc) => {
      const existingRun = testRunMap.get(tc.id);

      if (existingRun) {
        return {
          id: existingRun.id,
          submissionId: existingRun.submissionId,
          testCaseId: existingRun.testCaseId,
          status: existingRun.status as TestRunStatus,
          compileSuccess: existingRun.compileSuccess,
          compileTimeMs: existingRun.compileTimeMs,
          runSuccess: existingRun.runSuccess,
          runTimeMs: existingRun.runTimeMs,
          actualStdout: existingRun.actualStdout,
          actualStderr: existingRun.actualStderr,
          expectedStdout: existingRun.expectedStdout,
          expectedExitCode: existingRun.expectedExitCode,
          actualExitCode: existingRun.actualExitCode,
          pointsEarned: existingRun.pointsEarned,
          bonusEarned: existingRun.bonusEarned,
          errorMessage: existingRun.errorMessage,
          createdAt: existingRun.createdAt.toISOString(),
          completedAt: existingRun.completedAt?.toISOString() ?? null,
          testCase: {
            id: tc.id,
            name: tc.name,
            category: tc.category,
            points: tc.points,
          },
        };
      }

      return {
        id: `pending-${tc.id}`,
        submissionId,
        testCaseId: tc.id,
        status: TestRunStatus.PENDING,
        compileSuccess: null,
        compileTimeMs: null,
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
        createdAt: new Date().toISOString(),
        completedAt: null,
        testCase: {
          id: tc.id,
          name: tc.name,
          category: tc.category,
          points: tc.points,
        },
      };
    });
  }
}
