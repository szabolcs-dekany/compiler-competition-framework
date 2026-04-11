import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as yaml from 'js-yaml';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  FixedTestCase,
  GeneratorInputDefinition,
  GeneratorTestCase,
  TestCase,
  TestCaseBase,
  TestCaseInputType,
} from './test-case-loader.types';

const VALID_DIFFICULTIES = new Set([1, 2, 3]);
const VALID_INPUT_TYPES = new Set<TestCaseInputType>([
  'int',
  'float',
  'string',
  'choice',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertRecord(
  value: unknown,
  context: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object`);
  }

  return value;
}

function assertString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }

  return value;
}

function assertStringArray(value: unknown, context: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string')
  ) {
    throw new Error(`${context} must be an array of strings`);
  }

  return value;
}

function assertPositiveInt(value: unknown, context: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${context} must be a positive integer`);
  }

  return value as number;
}

function assertNonNegativeInt(value: unknown, context: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${context} must be a non-negative integer`);
  }

  return value as number;
}

function assertNullablePositiveInt(
  value: unknown,
  context: string,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return assertPositiveInt(value, context);
}

function assertBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${context} must be a boolean`);
  }

  return value;
}

function assertDifficulty(value: unknown, context: string): 1 | 2 | 3 {
  if (typeof value !== 'number' || !VALID_DIFFICULTIES.has(value)) {
    throw new Error(`${context} must be one of 1, 2, or 3`);
  }

  return value as 1 | 2 | 3;
}

function assertInputDefinitions(
  value: unknown,
  context: string,
): GeneratorInputDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array`);
  }

  const names = new Set<string>();

  return value.map((entry, index) => {
    const inputRecord = assertRecord(entry, `${context}[${index}]`);
    const variable = assertString(inputRecord.var, `${context}[${index}].var`);
    const type = inputRecord.type;

    if (
      typeof type !== 'string' ||
      !VALID_INPUT_TYPES.has(type as TestCaseInputType)
    ) {
      throw new Error(
        `${context}[${index}].type must be one of int, float, string, choice`,
      );
    }

    if (names.has(variable)) {
      throw new Error(`${context}[${index}].var '${variable}' is duplicated`);
    }

    names.add(variable);

    const definition: GeneratorInputDefinition = {
      var: variable,
      type: type as TestCaseInputType,
    };

    if (definition.type === 'int' || definition.type === 'float') {
      if (
        typeof inputRecord.min !== 'number' ||
        typeof inputRecord.max !== 'number'
      ) {
        throw new Error(
          `${context}[${index}] numeric inputs require min and max`,
        );
      }

      if (inputRecord.min > inputRecord.max) {
        throw new Error(`${context}[${index}] min must be <= max`);
      }

      definition.min = inputRecord.min;
      definition.max = inputRecord.max;
    }

    if (definition.type === 'string') {
      definition.length = assertPositiveInt(
        inputRecord.length ?? 8,
        `${context}[${index}].length`,
      );
    }

    if (definition.type === 'choice') {
      if (
        !Array.isArray(inputRecord.choices) ||
        inputRecord.choices.length === 0 ||
        inputRecord.choices.some((choice) => typeof choice !== 'string')
      ) {
        throw new Error(
          `${context}[${index}].choices must be a non-empty array of strings`,
        );
      }

      definition.choices = inputRecord.choices as string[];
    }

    return definition;
  });
}

function assertValidatorSource(source: string, context: string): void {
  try {
    const script = new vm.Script(
      `
${source}
if (typeof validate !== 'function') {
  throw new Error('Validator must define validate(output, inputs)');
}
      `,
    );
    script.runInNewContext({ Math }, { timeout: 50 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown validator error';
    throw new Error(`${context} is invalid: ${message}`);
  }
}

function validateBaseTestCase(
  raw: Record<string, unknown>,
): Omit<TestCaseBase, 'mode'> {
  return {
    id: assertString(raw.id, 'id'),
    category: assertString(raw.category, 'category'),
    name: assertString(raw.name, 'name'),
    description: assertString(raw.description, 'description'),
    difficulty: assertDifficulty(raw.difficulty, 'difficulty'),
    args: assertStringArray(raw.args ?? [], 'args'),
    timeout_ms: assertPositiveInt(raw.timeout_ms, 'timeout_ms'),
    max_memory_mb: assertPositiveInt(raw.max_memory_mb, 'max_memory_mb'),
    points: assertNonNegativeInt(raw.points, 'points'),
    performance_bonus: assertBoolean(
      raw.performance_bonus,
      'performance_bonus',
    ),
    performance_threshold_ms: assertNullablePositiveInt(
      raw.performance_threshold_ms,
      'performance_threshold_ms',
    ),
  };
}

function validateGeneratorTestCase(
  raw: Record<string, unknown>,
  base: Omit<TestCaseBase, 'mode'>,
): GeneratorTestCase {
  const generator = assertRecord(raw.generator, 'generator');
  const hasExpectedStdout = typeof generator.expected_stdout === 'string';
  const hasValidator = typeof generator.validator === 'string';

  if (hasExpectedStdout === hasValidator) {
    throw new Error(
      'generator must define exactly one of expected_stdout or validator',
    );
  }

  if (hasValidator) {
    assertValidatorSource(generator.validator as string, 'generator.validator');
  }

  return {
    ...base,
    mode: 'generator',
    generator: {
      runs: assertPositiveInt(generator.runs, 'generator.runs'),
      seed:
        generator.seed === 'deterministic' || generator.seed === 'random'
          ? generator.seed
          : (() => {
              throw new Error('generator.seed must be deterministic or random');
            })(),
      inputs: assertInputDefinitions(
        generator.inputs ?? [],
        'generator.inputs',
      ),
      stdin: assertString(generator.stdin, 'generator.stdin'),
      ...(hasExpectedStdout
        ? {
            expected_stdout: assertString(
              generator.expected_stdout,
              'generator.expected_stdout',
            ),
          }
        : {}),
      ...(hasValidator
        ? {
            validator: assertString(generator.validator, 'generator.validator'),
          }
        : {}),
      expected_exit_code: assertNonNegativeInt(
        generator.expected_exit_code,
        'generator.expected_exit_code',
      ),
    },
  };
}

function validateFixedTestCase(
  raw: Record<string, unknown>,
  base: Omit<TestCaseBase, 'mode'>,
): FixedTestCase {
  const stdin = raw.stdin;

  if (stdin !== null && stdin !== undefined && typeof stdin !== 'string') {
    throw new Error('stdin must be a string or null');
  }

  return {
    ...base,
    mode: 'fixed',
    stdin: stdin ?? null,
    expected_stdout: assertString(raw.expected_stdout, 'expected_stdout'),
    expected_exit_code: assertNonNegativeInt(
      raw.expected_exit_code,
      'expected_exit_code',
    ),
  };
}

function validateTestCase(rawValue: unknown): TestCase {
  const raw = assertRecord(rawValue, 'test case');
  const base = validateBaseTestCase(raw);

  return raw.generator
    ? validateGeneratorTestCase(raw, base)
    : validateFixedTestCase(raw, base);
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

  onModuleInit(): void {
    this.loadAll();
  }

  private loadAll(): void {
    if (!fs.existsSync(this.directory)) {
      throw new Error(`Test cases directory does not exist: ${this.directory}`);
    }

    const files = fs
      .readdirSync(this.directory)
      .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
      .sort();
    const nextCache = new Map<string, TestCase>();

    for (const file of files) {
      const filePath = path.join(this.directory, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const loaded = yaml.load(content);
      const testCase = validateTestCase(loaded);

      if (nextCache.has(testCase.id)) {
        throw new Error(
          `Duplicate test case id '${testCase.id}' in ${filePath}`,
        );
      }

      nextCache.set(testCase.id, testCase);
    }

    this.cache.clear();

    for (const [id, testCase] of nextCache.entries()) {
      this.cache.set(id, testCase);
    }

    this.logger.log(
      `Loaded ${this.cache.size} test case(s) from ${this.directory}`,
    );
  }

  get(id: string): TestCase | undefined {
    return this.cache.get(id);
  }

  getAll(): TestCase[] {
    return Array.from(this.cache.values());
  }

  reload(): void {
    this.loadAll();
  }
}
