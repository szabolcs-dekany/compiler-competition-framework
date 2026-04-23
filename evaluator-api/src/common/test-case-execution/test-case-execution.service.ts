import * as crypto from 'crypto';
import * as vm from 'vm';
import { Injectable } from '@nestjs/common';
import type {
  GeneratorInputDefinition,
  GeneratorTestCase,
  TestCase,
  TestCaseInputs,
  TestCaseInputValue,
} from '../test-case-loader/test-case-loader.types';
import type {
  CompletedAttemptResult,
  GeneratedAttempt,
  TestRunSummary,
} from './test-case-execution.types';

class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed % 2147483647;
    if (this.state <= 0) {
      this.state += 2147483646;
    }
  }

  next(): number {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }
}

@Injectable()
export class TestCaseExecutionService {
  generateAttempts(testCase: TestCase): GeneratedAttempt[] {
    if (testCase.mode === 'fixed') {
      return [
        {
          attemptIndex: 0,
          seed: 'fixed',
          generatedInputs: {},
          stdin: testCase.stdin,
          validationMode: 'EXPECTED_STDOUT',
          expectedStdout: testCase.expected_stdout,
          expectedExitCode: testCase.expected_exit_code,
        },
      ];
    }

    const attempts: GeneratedAttempt[] = [];

    for (
      let attemptIndex = 0;
      attemptIndex < testCase.generator.runs;
      attemptIndex += 1
    ) {
      const seed =
        testCase.generator.seed === 'random'
          ? crypto.randomBytes(8).toString('hex')
          : `${testCase.id}:${attemptIndex}`;
      const inputs = this.generateInputs(testCase.generator, seed);

      attempts.push({
        attemptIndex,
        seed,
        generatedInputs: inputs,
        stdin: this.renderTemplate(testCase.generator.stdin, inputs),
        validationMode: testCase.generator.expected_stdout
          ? 'EXPECTED_STDOUT'
          : 'VALIDATOR',
        expectedStdout: testCase.generator.expected_stdout
          ? this.renderTemplate(testCase.generator.expected_stdout, inputs)
          : null,
        expectedExitCode: testCase.generator.expected_exit_code,
      });
    }

    return attempts;
  }

  validateAttempt(
    testCase: TestCase,
    attempt: Pick<
      GeneratedAttempt,
      | 'generatedInputs'
      | 'validationMode'
      | 'expectedStdout'
      | 'expectedExitCode'
    >,
    actualStdout: string,
    actualExitCode: number,
  ): boolean {
    if (actualExitCode !== attempt.expectedExitCode) {
      return false;
    }

    if (attempt.validationMode === 'EXPECTED_STDOUT') {
      return (
        this.normalizeOutput(actualStdout) ===
        this.normalizeOutput(attempt.expectedStdout)
      );
    }

    if (testCase.mode !== 'generator' || !testCase.generator.validator) {
      return false;
    }

    const context = vm.createContext({
      Math,
      output: actualStdout,
      inputs: attempt.generatedInputs,
    });
    const script = new vm.Script(
      `
${testCase.generator.validator}
if (typeof validate !== 'function') {
  throw new Error('Validator must define validate(output, inputs)');
}
const result = validate(output, inputs);
if (typeof result !== 'boolean') {
  throw new Error('Validator must return a boolean');
}
result;
      `,
    );
    return script.runInContext(context, { timeout: 50 }) as boolean;
  }

  summarizeResults(
    testCase: TestCase,
    results: CompletedAttemptResult[],
  ): TestRunSummary {
    const attemptCount = results.length;
    const passedAttempts = results.filter((result) => result.passed).length;
    const allPassed = attemptCount > 0 && passedAttempts === attemptCount;
    const firstFailure = results.find(
      (result) => result.passed === false || result.errorMessage,
    );
    const reference = firstFailure ?? results[0] ?? null;
    const hasTimeout = results.some((result) => result.actualExitCode === -1);
    const hasSystemError = results.some(
      (result) =>
        result.errorMessage !== null &&
        result.errorMessage !== 'Output mismatch' &&
        !result.errorMessage.startsWith('Execution timed out after '),
    );
    const worstRunTimeMs = results.reduce<number | null>(
      (currentWorst, result) => {
        if (result.runTimeMs === null) {
          return currentWorst;
        }

        if (currentWorst === null) {
          return result.runTimeMs;
        }

        return Math.max(currentWorst, result.runTimeMs);
      },
      null,
    );
    const thresholdMet =
      allPassed &&
      testCase.performance_bonus &&
      testCase.performance_threshold_ms !== null &&
      worstRunTimeMs !== null &&
      worstRunTimeMs < testCase.performance_threshold_ms;
    const bonusEarned = thresholdMet ? Math.floor(testCase.points * 0.2) : 0;

    return {
      status: allPassed
        ? 'PASSED'
        : hasTimeout
          ? 'TIMEOUT'
          : hasSystemError
            ? 'ERROR'
            : 'FAILED',
      runSuccess: allPassed,
      runTimeMs: worstRunTimeMs,
      actualStdout: reference?.actualStdout ?? null,
      actualStderr: reference?.actualStderr ?? null,
      expectedStdout: reference?.expectedStdout ?? null,
      expectedExitCode: reference?.expectedExitCode ?? null,
      actualExitCode: reference?.actualExitCode ?? null,
      pointsEarned: allPassed ? testCase.points : 0,
      bonusEarned,
      errorMessage:
        reference?.errorMessage ?? (allPassed ? null : 'Output mismatch'),
      passedAttempts,
      attemptCount,
    };
  }

  normalizeOutput(output: string | null): string {
    return (output ?? '').replace(/\r\n/g, '\n').trim();
  }

  private generateInputs(
    testCase: GeneratorTestCase['generator'],
    seed: string,
  ): TestCaseInputs {
    const numericSeed = this.hashSeed(seed);
    const rng = new DeterministicRng(numericSeed);

    return testCase.inputs.reduce<TestCaseInputs>((inputs, definition) => {
      inputs[definition.var] = this.generateInputValue(definition, rng);
      return inputs;
    }, {});
  }

  private generateInputValue(
    definition: GeneratorInputDefinition,
    rng: DeterministicRng,
  ): TestCaseInputValue {
    if (definition.type === 'int') {
      const min = definition.min ?? 0;
      const max = definition.max ?? min;
      return Math.floor(rng.next() * (max - min + 1)) + min;
    }

    if (definition.type === 'float') {
      const min = definition.min ?? 0;
      const max = definition.max ?? min;
      return Number((min + rng.next() * (max - min)).toFixed(6));
    }

    if (definition.type === 'choice') {
      const choices = definition.choices ?? [];
      return choices[Math.floor(rng.next() * choices.length)];
    }

    const length = definition.length ?? 8;
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let value = '';

    for (let index = 0; index < length; index += 1) {
      value += alphabet[Math.floor(rng.next() * alphabet.length)];
    }

    return value;
  }

  private renderTemplate(template: string, inputs: TestCaseInputs): string {
    return template.replace(
      /\$\{([^}]+)\}/g,
      (_fullMatch, expression: string) =>
        String(this.evaluateExpression(expression, inputs)),
    );
  }

  private evaluateExpression(
    expression: string,
    inputs: TestCaseInputs,
  ): unknown {
    const context = vm.createContext({ ...inputs, Math });
    const script = new vm.Script(expression);
    return script.runInContext(context, { timeout: 50 });
  }

  private hashSeed(value: string): number {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }

    return Math.abs(hash) + 1;
  }
}
