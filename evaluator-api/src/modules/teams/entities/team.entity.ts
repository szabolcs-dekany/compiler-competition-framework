import { ApiProperty } from '@nestjs/swagger';

export class Team {
  @ApiProperty({ example: 'clx123abc' })
  id: string;

  @ApiProperty({ example: 'Compiler Crusaders' })
  name: string;

  @ApiProperty({ example: '2025-01-15T10:30:00Z' })
  createdAt: Date;
}
