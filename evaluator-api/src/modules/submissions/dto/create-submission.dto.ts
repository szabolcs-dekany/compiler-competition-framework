import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateSubmissionDto {
  @ApiProperty({ example: 'clx456def', description: 'Team ID to submit for' })
  @IsString()
  @IsNotEmpty()
  teamId: string;
}
