import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UploadSourceFileDto {
  @ApiProperty({ description: 'Team ID', example: 'clx123abc' })
  @IsString()
  @IsNotEmpty()
  teamId: string;

  @ApiProperty({ description: 'Test case ID', example: 'TC001' })
  @IsString()
  @IsNotEmpty()
  testCaseId: string;
}
