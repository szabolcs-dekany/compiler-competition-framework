import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { TestCase, TestCaseBlueprint } from './interfaces/test-case.interface';

@Injectable()
export class TestCasesService {
  private readonly testCasesDir = path.join(
    __dirname,
    '../../../../test-cases',
  );
  private testCases: Map<string, TestCase> | null = null;

  private loadTestCases(): Map<string, TestCase> {
    if (this.testCases) {
      return this.testCases;
    }

    this.testCases = new Map();

    const files = fs.readdirSync(this.testCasesDir);
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
        continue;
      }

      const filePath = path.join(this.testCasesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const testCase = yaml.load(content) as TestCase;

      this.testCases.set(testCase.id, testCase);
    }

    return this.testCases;
  }

  findAll(): TestCaseBlueprint[] {
    const testCases = this.loadTestCases();
    const blueprints: TestCaseBlueprint[] = [];

    for (const testCase of testCases.values()) {
      const blueprint: TestCaseBlueprint = {
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
      blueprints.push(blueprint);
    }

    return blueprints.sort((a, b) => a.id.localeCompare(b.id));
  }

  findOne(id: string): TestCaseBlueprint {
    const testCases = this.loadTestCases();
    const testCase = testCases.get(id);

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
    const testCases = this.loadTestCases();
    const testCase = testCases.get(id);

    if (!testCase) {
      throw new NotFoundException(`Test case with id ${id} not found`);
    }

    return testCase;
  }
}
