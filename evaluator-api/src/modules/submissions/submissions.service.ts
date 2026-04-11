import { Injectable, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import type {
  SubmissionCompilationDto,
  SubmissionDto,
  TestRunAttemptDto,
  TestRunDto,
} from '@evaluator/shared';
import { CompilationStatus } from '@evaluator/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { TestCasesService } from '../test-cases/test-cases.service';
import { CompileQueueService } from '../queue/compile-queue.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { Submission } from './entities/submission.entity';

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
      orderBy: {
        id: 'asc',
      },
    });

    const compilationMap = new Map(
      compilations.map((compilation) => [
        compilation.sourceFileVersion.sourceFile.testCaseId,
        compilation,
      ]),
    );
    const missingCompilationStatus =
      submission.compileStatus === 'PENDING' ||
      submission.compileStatus === 'RUNNING'
        ? CompilationStatus.PENDING
        : CompilationStatus.FAILED;
    const missingCompilationError =
      missingCompilationStatus === CompilationStatus.FAILED
        ? 'No source file snapshot available for this submission'
        : null;

    return allTestCases.map((testCase) => {
      const existing = compilationMap.get(testCase.id);

      if (existing) {
        return this.toCompilationDto(existing, testCase);
      }

      return {
        id: `missing-${submissionId}-${testCase.id}`,
        submissionId,
        testCaseId: testCase.id,
        status: missingCompilationStatus,
        errorMessage: missingCompilationError,
        startedAt: null,
        completedAt: null,
        testCase: {
          id: testCase.id,
          name: testCase.name,
          category: testCase.category,
          points: testCase.points,
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

  async findTestRuns(submissionId: string): Promise<TestRunDto[]> {
    await this.ensureSubmissionExists(submissionId);

    const testRuns = await this.prisma.testRun.findMany({
      where: { submissionId },
      include: {
        attempts: true,
      },
      orderBy: {
        testCaseId: 'asc',
      },
    });

    return testRuns.map((testRun) => this.toTestRunDto(testRun));
  }

  async getTestRunDto(testRunId: string): Promise<TestRunDto> {
    const testRun = await this.prisma.testRun.findUnique({
      where: { id: testRunId },
      include: {
        attempts: true,
      },
    });

    if (!testRun) {
      throw new NotFoundException(`Test run with id ${testRunId} not found`);
    }

    return this.toTestRunDto(testRun);
  }

  async getTestRunDtoByCompilationId(
    compilationId: string,
  ): Promise<TestRunDto> {
    const testRun = await this.prisma.testRun.findUnique({
      where: { compilationId },
      include: {
        attempts: true,
      },
    });

    if (!testRun) {
      throw new NotFoundException(
        `Test run for compilation ${compilationId} not found`,
      );
    }

    return this.toTestRunDto(testRun);
  }

  async getTestRunAttempts(
    submissionId: string,
    testCaseId: string,
  ): Promise<TestRunAttemptDto[]> {
    const testRun = await this.prisma.testRun.findUnique({
      where: {
        submissionId_testCaseId: {
          submissionId,
          testCaseId,
        },
      },
      include: {
        attempts: {
          orderBy: {
            attemptIndex: 'asc',
          },
        },
      },
    });

    if (!testRun) {
      throw new NotFoundException(
        `Test run for submission ${submissionId} and test case ${testCaseId} not found`,
      );
    }

    return testRun.attempts.map((attempt) => this.toTestRunAttemptDto(attempt));
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

  private async ensureSubmissionExists(submissionId: string): Promise<void> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true },
    });

    if (!submission) {
      throw new NotFoundException(
        `Submission with id ${submissionId} not found`,
      );
    }
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

  private toTestRunDto(testRun: {
    id: string;
    submissionId: string;
    compilationId: string | null;
    testCaseId: string;
    status: string;
    compileSuccess: boolean | null;
    compileTimeMs: number | null;
    runSuccess: boolean | null;
    runTimeMs: number | null;
    actualStdout: string | null;
    actualStderr: string | null;
    expectedStdout: string | null;
    expectedExitCode: number | null;
    actualExitCode: number | null;
    pointsEarned: number;
    bonusEarned: number;
    errorMessage: string | null;
    createdAt: Date;
    completedAt: Date | null;
    attempts: Array<{ passed: boolean | null }>;
  }): TestRunDto {
    const testCase = this.testCasesService.findOne(testRun.testCaseId);

    return {
      id: testRun.id,
      submissionId: testRun.submissionId,
      compilationId: testRun.compilationId,
      testCaseId: testRun.testCaseId,
      status: testRun.status as TestRunDto['status'],
      compileSuccess: testRun.compileSuccess,
      compileTimeMs: testRun.compileTimeMs,
      runSuccess: testRun.runSuccess,
      runTimeMs: testRun.runTimeMs,
      actualStdout: testRun.actualStdout,
      actualStderr: testRun.actualStderr,
      expectedStdout: testRun.expectedStdout,
      expectedExitCode: testRun.expectedExitCode,
      actualExitCode: testRun.actualExitCode,
      pointsEarned: testRun.pointsEarned,
      bonusEarned: testRun.bonusEarned,
      errorMessage: testRun.errorMessage,
      attemptCount: testRun.attempts.length,
      passedAttempts: testRun.attempts.filter((attempt) => attempt.passed)
        .length,
      createdAt: testRun.createdAt.toISOString(),
      completedAt: testRun.completedAt?.toISOString() ?? null,
      testCase: {
        id: testCase.id,
        name: testCase.name,
        category: testCase.category,
        points: testCase.points,
      },
    };
  }

  private toTestRunAttemptDto(attempt: {
    id: string;
    testRunId: string;
    attemptIndex: number;
    seed: string;
    generatedInputs: unknown;
    stdin: string | null;
    validationMode: string;
    expectedStdout: string | null;
    expectedExitCode: number;
    actualStdout: string | null;
    actualStderr: string | null;
    actualExitCode: number | null;
    runTimeMs: number | null;
    passed: boolean | null;
    errorMessage: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }): TestRunAttemptDto {
    return {
      id: attempt.id,
      testRunId: attempt.testRunId,
      attemptIndex: attempt.attemptIndex,
      seed: attempt.seed,
      generatedInputs:
        typeof attempt.generatedInputs === 'object' &&
        attempt.generatedInputs !== null
          ? (attempt.generatedInputs as Record<string, number | string>)
          : {},
      stdin: attempt.stdin,
      validationMode:
        attempt.validationMode as TestRunAttemptDto['validationMode'],
      expectedStdout: attempt.expectedStdout,
      expectedExitCode: attempt.expectedExitCode,
      actualStdout: attempt.actualStdout,
      actualStderr: attempt.actualStderr,
      actualExitCode: attempt.actualExitCode,
      runTimeMs: attempt.runTimeMs,
      passed: attempt.passed,
      errorMessage: attempt.errorMessage,
      createdAt: attempt.createdAt.toISOString(),
      completedAt: attempt.completedAt?.toISOString() ?? null,
    };
  }
}
