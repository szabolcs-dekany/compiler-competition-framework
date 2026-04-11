export type Difficulty = 1 | 2 | 3;

export interface GeneratorInputInfo {
  var: string;
  type: 'int' | 'float' | 'string' | 'choice';
  min?: number;
  max?: number;
  choices?: string[];
  length?: number;
}

export interface GeneratorInfo {
  runs: number;
  seed: 'deterministic' | 'random';
  inputs: GeneratorInputInfo[];
}

export type TestCaseMode = 'fixed' | 'generator';

export interface TestCaseBlueprint {
  id: string;
  category: string;
  name: string;
  description: string;
  difficulty: Difficulty;
  mode: TestCaseMode;
  args: string[];
  stdin: string | null;
  timeout_ms: number;
  max_memory_mb: number;
  points: number;
  performance_bonus: boolean;
  performance_threshold_ms: number | null;
  hasGenerator: boolean;
  generatorInfo: GeneratorInfo | null;
}
