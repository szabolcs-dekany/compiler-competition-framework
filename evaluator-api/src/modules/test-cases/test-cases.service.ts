import { Injectable, NotFoundException } from '@nestjs/common';
import {
  TestCaseLoaderService,
  TestCase,
} from '../../common/test-case-loader/test-case-loader.service';

export type TestCaseBlueprint = Omit<
  TestCase,
  'expected_stdout' | 'expected_exit_code'
>;

@Injectable()
export class TestCasesService {
  constructor(private readonly testCaseLoader: TestCaseLoaderService) {}

  findAll(): TestCaseBlueprint[] {
    const testCases = this.testCaseLoader.getAll();

    return testCases
      .map((tc) => ({
        id: tc.id,
        category: tc.category,
        name: tc.name,
        description: tc.description,
        difficulty: tc.difficulty,
        args: tc.args,
        stdin: tc.stdin,
        timeout_ms: tc.timeout_ms,
        max_memory_mb: tc.max_memory_mb,
        points: tc.points,
        performance_bonus: tc.performance_bonus,
        performance_threshold_ms: tc.performance_threshold_ms,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  findOne(id: string): TestCaseBlueprint {
    const testCase = this.testCaseLoader.get(id);

    if (!testCase) {
      throw new NotFoundException(`Test case with id ${id} not found`);
    }

    return {
      id: testCase.id,
      category: testCase.category,
      name: testCase.name,
      description: testCase.description,
      difficulty: testCase.difficulty,
      args: testCase.args,
      stdin: testCase.stdin,
      timeout_ms: testCase.timeout_ms,
      max_memory_mb: testCase.max_memory_mb,
      points: testCase.points,
      performance_bonus: testCase.performance_bonus,
      performance_threshold_ms: testCase.performance_threshold_ms,
    };
  }

  getFullTestCase(id: string): TestCase {
    const testCase = this.testCaseLoader.get(id);

    if (!testCase) {
      throw new NotFoundException(`Test case with id ${id} not found`);
    }

    return testCase;
  }
}
