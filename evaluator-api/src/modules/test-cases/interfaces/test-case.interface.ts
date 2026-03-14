export interface TestCase {
  id: string;
  category: string;
  name: string;
  description: string;
  difficulty: 1 | 2 | 3;
  args: string[];
  stdin: string | null;
  expected_stdout: string;
  expected_exit_code: number;
  timeout_ms: number;
  max_memory_mb: number;
  points: number;
  performance_bonus: boolean;
  performance_threshold_ms: number | null;
}

export type TestCaseBlueprint = Omit<
  TestCase,
  'expected_stdout' | 'expected_exit_code'
>;
