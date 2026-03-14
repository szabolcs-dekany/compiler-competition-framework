import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TestCasesService } from './test-cases.service';
import { TestCaseBlueprintDto } from './dto/test-case-blueprint.dto';

@ApiTags('test-cases')
@Controller('test-cases')
export class TestCasesController {
  constructor(private readonly testCasesService: TestCasesService) {}

  @Get()
  @ApiOperation({ summary: 'List all test cases' })
  @ApiResponse({
    status: 200,
    description: 'List of test case blueprints',
    type: [TestCaseBlueprintDto],
  })
  findAll(): TestCaseBlueprintDto[] {
    return this.testCasesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a test case by ID' })
  @ApiParam({ name: 'id', description: 'Test case ID (e.g., TC001)' })
  @ApiResponse({
    status: 200,
    description: 'Test case blueprint',
    type: TestCaseBlueprintDto,
  })
  @ApiResponse({ status: 404, description: 'Test case not found' })
  findOne(@Param('id') id: string): TestCaseBlueprintDto {
    return this.testCasesService.findOne(id);
  }
}
