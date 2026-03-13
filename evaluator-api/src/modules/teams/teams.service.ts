import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { Team } from './entities/team.entity';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createTeamDto: CreateTeamDto): Promise<Team> {
    return this.prisma.team.create({
      data: {
        name: createTeamDto.name,
      },
    });
  }

  async findAll(): Promise<Team[]> {
    return this.prisma.team.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string): Promise<Team | null> {
    return this.prisma.team.findUnique({
      where: { id },
    });
  }

  async findByName(name: string): Promise<Team | null> {
    return this.prisma.team.findUnique({
      where: { name },
    });
  }

  async remove(id: string): Promise<Team> {
    return this.prisma.team.delete({
      where: { id },
    });
  }
}
