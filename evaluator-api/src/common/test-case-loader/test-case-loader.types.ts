export type TestCaseInputType = 'int' | 'float' | 'string' | 'choice';
export type TestCaseInputValue = number | string;
export type TestCaseInputs = Record<string, TestCaseInputValue>;
export type TestCaseMode = 'fixed' | 'generator';

export interface GeneratorInputDefinition {
  var: string;
  type: TestCaseInputType;
  min?: number;
  max?: number;
  choices?: string[];
  length?: number;
}

export interface TestCaseBase {
  id: string;
  category: string;
  name: string;
  description: string;
  difficulty: 1 | 2 | 3;
  args: string[];
  timeout_ms: number;
  max_memory_mb: number;
  points: number;
  performance_bonus: boolean;
  performance_threshold_ms: number | null;
  mode: TestCaseMode;
}

export interface FixedTestCase extends TestCaseBase {
  mode: 'fixed';
  stdin: string | null;
  expected_stdout: string;
  expected_exit_code: number;
}

export interface GeneratorTestCase extends TestCaseBase {
  mode: 'generator';
  generator: {
    runs: number;
    seed: 'deterministic' | 'random';
    inputs: GeneratorInputDefinition[];
    stdin: string;
    expected_stdout?: string;
    validator?: string;
    expected_exit_code: number;
  };
}

export type TestCase = FixedTestCase | GeneratorTestCase;
