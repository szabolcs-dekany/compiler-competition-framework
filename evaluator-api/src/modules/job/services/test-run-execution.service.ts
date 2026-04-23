import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SubmissionEventsService } from '../../submissions/submission-events.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  CompilationFailureResultInput,
  EnsureEvaluationTestRunInput,
  EvaluationFailureInput,
} from '../types/test-run-execution.types';

@Injectable()
export class TestRunExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly submissionEventsService: SubmissionEventsService,
  ) {}

  async markSubmissionEvaluating(submissionId: string): Promise<void> {
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'EVALUATING',
      },
    });

    await this.submissionEventsService.publishSubmissionEvent(
      submissionId,
      'status',
    );
  }

  async recordCompilationFailureResult(
    input: CompilationFailureResultInput,
  ): Promise<void> {
    const testRun = await this.prisma.testRun.upsert({
      where: {
        submissionId_testCaseId: {
          submissionId: input.submissionId,
          testCaseId: input.testCaseId,
        },
      },
      update: {
        compilationId: input.compilationId,
        status: 'FAILED',
        compileSuccess: false,
        compileTimeMs: input.compileTimeMs,
        runSuccess: false,
        runTimeMs: null,
        actualStdout: null,
        actualStderr: input.errorMessage,
        expectedStdout: null,
        expectedExitCode: null,
        actualExitCode: null,
        pointsEarned: 0,
        bonusEarned: 0,
        errorMessage: input.errorMessage,
        completedAt: new Date(),
      },
      create: {
        submissionId: input.submissionId,
        compilationId: input.compilationId,
        testCaseId: input.testCaseId,
        status: 'FAILED',
        compileSuccess: false,
        compileTimeMs: input.compileTimeMs,
        runSuccess: false,
        pointsEarned: 0,
        bonusEarned: 0,
        actualStderr: input.errorMessage,
        errorMessage: input.errorMessage,
        completedAt: new Date(),
      },
      select: { id: true },
    });

    await this.submissionEventsService.publishTestRunStatus(testRun.id);
  }

  async ensureEvaluationTestRun(
    input: EnsureEvaluationTestRunInput,
  ): Promise<{ id: string }> {
    return this.prisma.testRun.upsert({
      where: {
        submissionId_testCaseId: {
          submissionId: input.submissionId,
          testCaseId: input.testCaseId,
        },
      },
      update: {
        compilationId: input.compilationId,
        status: 'PENDING',
        compileSuccess: true,
        compileTimeMs: input.compileTimeMs,
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
      create: {
        submissionId: input.submissionId,
        compilationId: input.compilationId,
        testCaseId: input.testCaseId,
        status: 'PENDING',
        compileSuccess: true,
        compileTimeMs: input.compileTimeMs,
        pointsEarned: 0,
        bonusEarned: 0,
      },
      select: { id: true },
    });
  }

  async updateTestRun(
    testRunId: string,
    data: Prisma.TestRunUpdateInput,
  ): Promise<void> {
    await this.prisma.testRun.update({
      where: { id: testRunId },
      data,
    });

    await this.submissionEventsService.publishTestRunStatus(testRunId);
  }

  async recordEvaluationFailure(input: EvaluationFailureInput): Promise<void> {
    const testRun = await this.prisma.testRun.upsert({
      where: {
        submissionId_testCaseId: {
          submissionId: input.submissionId,
          testCaseId: input.testCaseId,
        },
      },
      update: {
        compilationId: input.compilationId,
        status: 'ERROR',
        runSuccess: false,
        pointsEarned: 0,
        bonusEarned: 0,
        errorMessage: input.errorMessage,
        completedAt: new Date(),
      },
      create: {
        submissionId: input.submissionId,
        compilationId: input.compilationId,
        testCaseId: input.testCaseId,
        status: 'ERROR',
        compileSuccess: true,
        runSuccess: false,
        pointsEarned: 0,
        bonusEarned: 0,
        errorMessage: input.errorMessage,
        completedAt: new Date(),
      },
      select: { id: true },
    });

    await this.submissionEventsService.publishTestRunStatus(testRun.id);
  }

  async finalizeSubmissionIfComplete(submissionId: string): Promise<void> {
    const [submission, compilations, testRuns] = await Promise.all([
      this.prisma.submission.findUnique({
        where: { id: submissionId },
        select: { compileStatus: true },
      }),
      this.prisma.compilation.findMany({
        where: { submissionId },
      }),
      this.prisma.testRun.findMany({
        where: { submissionId },
      }),
    ]);

    if (!submission) {
      return;
    }

    const hasPendingCompilations = compilations.some(
      (compilation) =>
        compilation.status !== 'SUCCESS' && compilation.status !== 'FAILED',
    );

    if (hasPendingCompilations) {
      return;
    }

    const completedCompilations = compilations.filter(
      (compilation) =>
        compilation.status === 'SUCCESS' || compilation.status === 'FAILED',
    );
    const pendingEvaluations = completedCompilations.some((compilation) => {
      const testRun = testRuns.find(
        (candidate) => candidate.compilationId === compilation.id,
      );

      return (
        !testRun ||
        testRun.status === 'PENDING' ||
        testRun.status === 'RUNNING' ||
        testRun.completedAt === null
      );
    });

    if (pendingEvaluations) {
      return;
    }

    const hasSuccessfulCompilation = completedCompilations.some(
      (compilation) => compilation.status === 'SUCCESS',
    );
    const totalScore = testRuns.reduce(
      (score, testRun) => score + testRun.pointsEarned + testRun.bonusEarned,
      0,
    );

    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status:
          submission.compileStatus === 'FAILED' && !hasSuccessfulCompilation
            ? 'FAILED'
            : 'COMPLETED',
        totalScore,
      },
    });

    await this.submissionEventsService.publishSubmissionEvent(
      submissionId,
      'complete',
    );
  }
}
