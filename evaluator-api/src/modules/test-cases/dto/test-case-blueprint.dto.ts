import { ApiProperty } from '@nestjs/swagger';

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
}
