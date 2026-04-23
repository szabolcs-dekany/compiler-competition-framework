import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  SubmissionCompilationDto,
  SubmissionDto,
  TestRunAttemptDto,
  TestRunDto,
} from '@evaluator/shared';
import { CompilationStatus } from '@evaluator/shared';
import { Readable } from 'stream';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { TestCasesService } from '../test-cases/test-cases.service';
import { Submission } from './entities/submission.entity';

@Injectable()
export class SubmissionReaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly testCasesService: TestCasesService,
  ) {}

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

  async getCompileLogStream(submissionId: string): Promise<Readable> {
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

    return this.storage.getFileStream(submission.compileLogS3Key);
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
      generatedInputs: this.toGeneratedInputsRecord(attempt.generatedInputs),
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

  private toGeneratedInputsRecord(
    value: unknown,
  ): Record<string, number | string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return {};
    }

    const entries = Object.entries(value);
    if (
      entries.some(
        ([, entryValue]) =>
          typeof entryValue !== 'number' && typeof entryValue !== 'string',
      )
    ) {
      return {};
    }

    return Object.fromEntries(entries) as Record<string, number | string>;
  }
}
