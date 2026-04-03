import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  generator?: {
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
    stdin: string;
    expected_stdout?: string;
    validator?: string;
    expected_exit_code?: number;
  };
}

@Injectable()
export class TestCaseLoaderService implements OnModuleInit {
  private readonly logger = new Logger(TestCaseLoaderService.name);
  private readonly cache: Map<string, TestCase> = new Map();
  private readonly directory: string;

  constructor(private readonly configService: ConfigService) {
    const configuredDir = this.configService.get<string>(
      'TEST_CASES_DIR',
      'test-cases',
    );
    this.directory = path.isAbsolute(configuredDir)
      ? configuredDir
      : path.join(process.cwd(), configuredDir);
  }

  onModuleInit() {
    this.loadAll();
  }

  private loadAll(): void {
    if (!fs.existsSync(this.directory)) {
      this.logger.warn(
        `Test cases directory does not exist: ${this.directory}`,
      );
      return;
    }

    const files = fs.readdirSync(this.directory);
    let loaded = 0;

    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
        continue;
      }

      const filePath = path.join(this.directory, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const testCase = yaml.load(content) as TestCase;
        this.cache.set(testCase.id, testCase);
        loaded++;
      } catch (error) {
        this.logger.error(
          `Failed to load test case from '${filePath}':`,
          error,
        );
      }
    }

    this.logger.log(`Loaded ${loaded} test case(s) from ${this.directory}`);
  }

  get(id: string): TestCase | undefined {
    return this.cache.get(id);
  }

  getAll(): TestCase[] {
    return Array.from(this.cache.values());
  }

  reload(): void {
    this.cache.clear();
    this.loadAll();
  }
}
