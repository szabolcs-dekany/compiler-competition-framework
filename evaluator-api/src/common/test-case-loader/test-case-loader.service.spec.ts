import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { TestCaseLoaderService } from './test-case-loader.service';

describe('TestCaseLoaderService', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'test-case-loader-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function createService(): TestCaseLoaderService {
    const configService = {
      get: jest.fn((key: string, fallback: string) =>
        key === 'TEST_CASES_DIR' ? directory : fallback,
      ),
    } as unknown as ConfigService;
    return new TestCaseLoaderService(configService);
  }

  it('loads valid generator test cases', () => {
    fs.writeFileSync(
      path.join(directory, 'TC001.yaml'),
      `
id: TC001
category: arithmetic
name: Integer Addition
description: Add two random positive integers and print result
difficulty: 2
args: []
timeout_ms: 5000
max_memory_mb: 256
points: 10
performance_bonus: true
performance_threshold_ms: 100
generator:
  runs: 3
  seed: deterministic
  inputs:
    - var: a
      type: int
      min: 1
      max: 10
  stdin: "\${a}"
  expected_stdout: "\${a}"
  expected_exit_code: 0
      `,
    );

    const service = createService();
    service.onModuleInit();

    expect(service.getAll()).toHaveLength(1);
    expect(service.get('TC001')?.mode).toBe('generator');
  });

  it('rejects invalid generator definitions', () => {
    fs.writeFileSync(
      path.join(directory, 'TC001.yaml'),
      `
id: TC001
category: arithmetic
name: Invalid
description: Invalid generator
difficulty: 2
args: []
timeout_ms: 5000
max_memory_mb: 256
points: 10
performance_bonus: true
performance_threshold_ms: 100
generator:
  runs: 3
  seed: deterministic
  inputs: []
  stdin: "1"
  expected_exit_code: 0
      `,
    );

    const service = createService();

    expect(() => service.onModuleInit()).toThrow(
      'generator must define exactly one of expected_stdout or validator',
    );
  });
});
