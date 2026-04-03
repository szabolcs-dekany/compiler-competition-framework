import { ApiProperty } from '@nestjs/swagger';

class GeneratorInputInfoDto {
  @ApiProperty({ example: 'a' })
  var: string;

  @ApiProperty({ enum: ['int', 'float', 'string', 'choice'], example: 'int' })
  type: 'int' | 'float' | 'string' | 'choice';

  @ApiProperty({ example: 1, required: false })
  min?: number;

  @ApiProperty({ example: 1000, required: false })
  max?: number;

  @ApiProperty({ example: ['foo', 'bar'], required: false })
  choices?: string[];

  @ApiProperty({ example: 10, required: false })
  length?: number;
}

class GeneratorInfoDto {
  @ApiProperty({ example: 3 })
  runs: number;

  @ApiProperty({ enum: ['deterministic', 'random'], example: 'deterministic' })
  seed: 'deterministic' | 'random';

  @ApiProperty({ type: [GeneratorInputInfoDto] })
  inputs: GeneratorInputInfoDto[];
}

export class TestCaseBlueprintDto {
  @ApiProperty({ example: 'TC001' })
  id: string;

  @ApiProperty({ example: 'arithmetic' })
  category: string;

  @ApiProperty({ example: 'Integer Addition' })
  name: string;

  @ApiProperty({ example: 'Add two positive integers and print result' })
  description: string;

  @ApiProperty({ enum: [1, 2, 3], example: 1 })
  difficulty: 1 | 2 | 3;

  @ApiProperty({ example: [] })
  args: string[];

  @ApiProperty({ example: '15\n27', nullable: true })
  stdin: string | null;

  @ApiProperty({ example: 5000 })
  timeout_ms: number;

  @ApiProperty({ example: 256 })
  max_memory_mb: number;

  @ApiProperty({ example: 10 })
  points: number;

  @ApiProperty({ example: true })
  performance_bonus: boolean;

  @ApiProperty({ example: 100, nullable: true })
  performance_threshold_ms: number | null;

  @ApiProperty({ example: true })
  hasGenerator: boolean;

  @ApiProperty({ type: GeneratorInfoDto, nullable: true })
  generatorInfo: GeneratorInfoDto | null;
}
