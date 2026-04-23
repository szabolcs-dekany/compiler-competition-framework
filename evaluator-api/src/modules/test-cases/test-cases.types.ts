export interface TestCaseBlueprint {
  id: string;
  category: string;
  name: string;
  description: string;
  difficulty: 1 | 2 | 3;
  mode: 'fixed' | 'generator';
  args: string[];
  stdin: string | null;
  timeout_ms: number;
  max_memory_mb: number;
  points: number;
  performance_bonus: boolean;
  performance_threshold_ms: number | null;
  generator_info: {
    runs: number;
    seed: 'deterministic' | 'random';
    inputs: Array<{
      var: string;
      type: 'int' | 'float' | 'string' | 'choice';
      min?: number;
      max?: number;
      choices?: string[];
      length?: number;
    }>;
  } | null;
}
