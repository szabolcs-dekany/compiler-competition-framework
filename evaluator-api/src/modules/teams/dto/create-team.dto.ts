import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ example: 'Compiler Crusaders' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
