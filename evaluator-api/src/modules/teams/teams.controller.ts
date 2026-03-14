import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { Team } from './entities/team.entity';

@ApiTags('teams')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new team' })
  @ApiResponse({ status: 201, description: 'Team created', type: Team })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  create(@Body() createTeamDto: CreateTeamDto): Promise<Team> {
    return this.teamsService.create(createTeamDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all teams' })
  @ApiResponse({ status: 200, description: 'List of teams', type: [Team] })
  findAll(): Promise<Team[]> {
    return this.teamsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a team by ID' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiResponse({ status: 200, description: 'Team details', type: Team })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async findOne(@Param('id') id: string): Promise<Team> {
    const team = await this.teamsService.findOne(id);
    if (!team) {
      throw new NotFoundException(`Team with id ${id} not found`);
    }
    return team;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a team' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiResponse({ status: 204, description: 'Team deleted' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async remove(@Param('id') id: string): Promise<void> {
    const team = await this.teamsService.findOne(id);
    if (!team) {
      throw new NotFoundException(`Team with id ${id} not found`);
    }
    await this.teamsService.remove(id);
  }
}
