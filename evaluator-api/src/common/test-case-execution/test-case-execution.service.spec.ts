import { TestCaseExecutionService } from './test-case-execution.service';

describe('TestCaseExecutionService', () => {
  let service: TestCaseExecutionService;

  beforeEach(() => {
    service = new TestCaseExecutionService();
  });

  it('generates deterministic attempts for seeded generator cases', () => {
    const testCase = {
      id: 'TC001',
      category: 'arithmetic',
      name: 'Addition',
      description: 'Adds numbers',
      difficulty: 1,
      args: [],
      timeout_ms: 1000,
      max_memory_mb: 128,
      points: 10,
      performance_bonus: false,
      performance_threshold_ms: null,
      mode: 'generator' as const,
      generator: {
        runs: 2,
        seed: 'deterministic' as const,
        inputs: [
          {
            var: 'a',
            type: 'int' as const,
            min: 1,
            max: 10,
          },
        ],
        stdin: '${a}\n',
        expected_stdout: '${a}\n',
        expected_exit_code: 0,
      },
    };

    expect(service.generateAttempts(testCase)).toEqual(
      service.generateAttempts(testCase),
    );
  });

  it('validates output with validator functions', () => {
    const testCase = {
      id: 'TC003',
      category: 'control-flow',
      name: 'Conditional',
      description: 'Checks validator path',
      difficulty: 2,
      args: [],
      timeout_ms: 1000,
      max_memory_mb: 128,
      points: 15,
      performance_bonus: false,
      performance_threshold_ms: null,
      mode: 'generator' as const,
      generator: {
        runs: 1,
        seed: 'deterministic' as const,
        inputs: [
          {
            var: 'x',
            type: 'int' as const,
            min: 1,
            max: 1,
          },
        ],
        stdin: '${x}\n',
        validator:
          'function validate(output, inputs) { return output.trim() === String(inputs.x); }',
        expected_exit_code: 0,
      },
    };
    const [attempt] = service.generateAttempts(testCase);

    expect(service.validateAttempt(testCase, attempt, '1\n', 0)).toBe(true);
    expect(service.validateAttempt(testCase, attempt, '2\n', 0)).toBe(false);
  });

  it('summarizes failures without marking them as system errors', () => {
    const testCase = {
      id: 'TC001',
      category: 'arithmetic',
      name: 'Addition',
      description: 'Adds numbers',
      difficulty: 1,
      args: [],
      timeout_ms: 1000,
      max_memory_mb: 128,
      points: 10,
      performance_bonus: true,
      performance_threshold_ms: 50,
      mode: 'fixed' as const,
      stdin: '1\n2\n',
      expected_stdout: '3\n',
      expected_exit_code: 0,
    };

    const summary = service.summarizeResults(testCase, [
      {
        validationMode: 'EXPECTED_STDOUT',
        expectedStdout: '3\n',
        expectedExitCode: 0,
        actualStdout: '4\n',
        actualStderr: '',
        actualExitCode: 0,
        runTimeMs: 10,
        passed: false,
        errorMessage: 'Output mismatch',
      },
    ]);

    expect(summary.status).toBe('FAILED');
    expect(summary.pointsEarned).toBe(0);
    expect(summary.bonusEarned).toBe(0);
  });
});
