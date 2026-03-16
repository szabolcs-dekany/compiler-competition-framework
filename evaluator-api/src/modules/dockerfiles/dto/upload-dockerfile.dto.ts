import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UploadDockerfileDto {
  @ApiProperty({ description: 'Team ID', example: 'clx123abc' })
  @IsString()
  @IsNotEmpty()
  teamId: string;
}
