import { Injectable, NotFoundException } from '@nestjs/common';
import { TestCaseLoaderService } from '../../common/test-case-loader/test-case-loader.service';
import type { TestCase } from '../../common/test-case-loader/test-case-loader.types';
import type { TestCaseBlueprint } from './test-cases.types';

@Injectable()
export class TestCasesService {
  constructor(private readonly testCaseLoader: TestCaseLoaderService) {}

  private toBlueprint(tc: TestCase): TestCaseBlueprint {
    return {
      id: tc.id,
      category: tc.category,
      name: tc.name,
      description: tc.description,
      difficulty: tc.difficulty,
      mode: tc.mode,
      args: tc.args,
      stdin: tc.mode === 'fixed' ? tc.stdin : null,
      timeout_ms: tc.timeout_ms,
      max_memory_mb: tc.max_memory_mb,
      points: tc.points,
      performance_bonus: tc.performance_bonus,
      performance_threshold_ms: tc.performance_threshold_ms,
      generator_info:
        tc.mode === 'generator'
          ? {
              runs: tc.generator.runs,
              seed: tc.generator.seed,
              inputs: tc.generator.inputs,
            }
          : null,
    };
  }

  findAll(): TestCaseBlueprint[] {
    const testCases = this.testCaseLoader.getAll();

    return testCases
      .map((tc) => this.toBlueprint(tc))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  findOne(id: string): TestCaseBlueprint {
    const testCase = this.testCaseLoader.get(id);

    if (!testCase) {
      throw new NotFoundException(`Test case with id ${id} not found`);
    }

    return this.toBlueprint(testCase);
  }

  getFullTestCase(id: string): TestCase {
    const testCase = this.testCaseLoader.get(id);

    if (!testCase) {
      throw new NotFoundException(`Test case with id ${id} not found`);
    }

    return testCase;
  }
}
