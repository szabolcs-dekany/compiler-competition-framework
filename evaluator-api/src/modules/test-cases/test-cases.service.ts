import { Injectable, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import { YamlLoader } from '../../common/yaml-loader';
import { TestCase, TestCaseBlueprint } from './interfaces/test-case.interface';

@Injectable()
export class TestCasesService {
  private readonly loader: YamlLoader<TestCase>;

  constructor() {
    const testCasesDir = path.join(__dirname, '../../../../test-cases');
    this.loader = new YamlLoader<TestCase>(testCasesDir);
  }

  findAll(): TestCaseBlueprint[] {
    const testCases = this.loader.getAll();

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
    const testCase = this.loader.get(id);

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
    const testCase = this.loader.get(id);

    if (!testCase) {
      throw new NotFoundException(`Test case with id ${id} not found`);
    }

    return testCase;
  }
}
