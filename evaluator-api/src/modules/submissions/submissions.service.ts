import { Injectable, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { TestCasesService } from '../test-cases/test-cases.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { Submission } from './entities/submission.entity';
import type {
  SubmissionCompilationDto,
  SubmissionDto,
} from '@evaluator/shared';
import { CompilationStatus } from '@evaluator/shared';
import { CompileQueueService } from '../queue/compile-queue.service';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly testCasesService: TestCasesService,
    private readonly compileQueueService: CompileQueueService,
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

    const originalName = file.originalname || 'compiler';
    const extension = path.extname(originalName) || '';

    const submission = await this.prisma.submission.create({
      data: {
        teamId: createSubmissionDto.teamId,
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

  async findOneDto(id: string): Promise<SubmissionDto | null> {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        team: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!submission) {
      return null;
    }

    return this.toSubmissionDto({
      ...submission,
      teamName: submission.team.name,
    });
  }

  async getSubmissionDto(id: string): Promise<SubmissionDto> {
    const submission = await this.findOneDto(id);

    if (!submission) {
      throw new NotFoundException(`Submission with id ${id} not found`);
    }

    return submission;
  }

  async findCompilations(
    submissionId: string,
  ): Promise<SubmissionCompilationDto[]> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException(
        `Submission with id ${submissionId} not found`,
      );
    }

    const allTestCases = this.testCasesService.findAll();

    const compilations = await this.prisma.compilation.findMany({
      where: { submissionId },
      include: {
        sourceFileVersion: {
          include: {
            sourceFile: true,
          },
        },
      },
    });

    const compilationMap = new Map(
      compilations.map((c) => [c.sourceFileVersion.sourceFile.testCaseId, c]),
    );

    return allTestCases.map((tc) => {
      const existing = compilationMap.get(tc.id);

      if (existing) {
        return this.toCompilationDto(existing, tc);
      }

      return {
        id: `pending-${tc.id}`,
        submissionId,
        testCaseId: tc.id,
        status: CompilationStatus.PENDING,
        errorMessage: null,
        startedAt: null,
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

  async getCompilationDto(
    compilationId: string,
  ): Promise<SubmissionCompilationDto> {
    const compilation = await this.prisma.compilation.findUnique({
      where: { id: compilationId },
      include: {
        sourceFileVersion: {
          include: {
            sourceFile: true,
          },
        },
      },
    });

    if (!compilation) {
      throw new NotFoundException(
        `Compilation with id ${compilationId} not found`,
      );
    }

    const testCaseId = compilation.sourceFileVersion.sourceFile.testCaseId;
    const testCase = this.testCasesService.findOne(testCaseId);

    return this.toCompilationDto(compilation, testCase);
  }

  async getCompileLogs(submissionId: string): Promise<string> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException(
        `Submission with id ${submissionId} not found`,
      );
    }

    if (!submission.compileLogS3Key) {
      throw new NotFoundException(
        `No compile logs found for submission ${submissionId}`,
      );
    }

    const logBuffer = await this.storage.getFile(submission.compileLogS3Key);
    return logBuffer.toString('utf-8');
  }

  private toSubmissionDto(submission: {
    id: string;
    teamId: string;
    teamName: string;
    version: number;
    originalName: string;
    extension: string;
    compilerPath: string | null;
    status: Submission['status'];
    submittedAt: Date;
    totalScore: number;
    compileStatus: Submission['compileStatus'];
    compileLogS3Key: string | null;
    compileStartedAt: Date | null;
    compileCompletedAt: Date | null;
    compileError: string | null;
  }): SubmissionDto {
    return {
      id: submission.id,
      teamId: submission.teamId,
      teamName: submission.teamName,
      version: submission.version,
      originalName: submission.originalName,
      extension: submission.extension,
      compilerPath: submission.compilerPath,
      status: submission.status as SubmissionDto['status'],
      submittedAt: submission.submittedAt.toISOString(),
      totalScore: submission.totalScore,
      compileStatus: submission.compileStatus as SubmissionDto['compileStatus'],
      compileLogS3Key: submission.compileLogS3Key,
      compileStartedAt: submission.compileStartedAt?.toISOString() ?? null,
      compileCompletedAt: submission.compileCompletedAt?.toISOString() ?? null,
      compileError: submission.compileError,
    };
  }

  private toCompilationDto(
    compilation: {
      id: string;
      submissionId: string;
      status: string;
      errorMessage: string | null;
      startedAt: Date | null;
      completedAt: Date | null;
    },
    testCase: {
      id: string;
      name: string;
      category: string;
      points: number;
    },
  ): SubmissionCompilationDto {
    return {
      id: compilation.id,
      submissionId: compilation.submissionId,
      testCaseId: testCase.id,
      status: compilation.status as CompilationStatus,
      errorMessage: compilation.errorMessage,
      startedAt: compilation.startedAt?.toISOString() ?? null,
      completedAt: compilation.completedAt?.toISOString() ?? null,
      testCase: {
        id: testCase.id,
        name: testCase.name,
        category: testCase.category,
        points: testCase.points,
      },
    };
  }
}
