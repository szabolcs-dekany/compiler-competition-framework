import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { Submission } from './entities/submission.entity';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async create(
    createSubmissionDto: CreateSubmissionDto,
    file: Express.Multer.File,
  ): Promise<Submission> {
    const team = await this.prisma.team.findUnique({
      where: { id: createSubmissionDto.teamId },
      include: { submissions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    if (!team) {
      throw new NotFoundException(
        `Team with id ${createSubmissionDto.teamId} not found`,
      );
    }

    const nextVersion =
      team.submissions.length > 0 ? team.submissions[0].version + 1 : 1;

    const submission = await this.prisma.submission.create({
      data: {
        teamId: createSubmissionDto.teamId,
        version: nextVersion,
        compilerPath: null,
      },
      include: {
        team: {
          select: {
            name: true,
          },
        },
      },
    });

    const key = `compilers/${createSubmissionDto.teamId}/${submission.id}.tar.gz`;

    try {
      await this.storage.uploadFile(key, file.buffer, file.mimetype);

      const updatedSubmission = await this.prisma.submission.update({
        where: { id: submission.id },
        data: { compilerPath: key },
        include: {
          team: {
            select: {
              name: true,
            },
          },
        },
      });

      return {
        ...updatedSubmission,
        teamName: updatedSubmission.team.name,
      };
    } catch (error) {
      await this.prisma.submission.delete({ where: { id: submission.id } });
      throw error;
    }
  }

  async findAll(): Promise<Submission[]> {
    const submissions = await this.prisma.submission.findMany({
      orderBy: {
        submittedAt: 'desc',
      },
      include: {
        team: {
          select: {
            name: true,
          },
        },
      },
    });

    return submissions.map((s) => ({
      ...s,
      teamName: s.team.name,
    }));
  }

  async findByTeam(teamId: string): Promise<Submission[]> {
    const submissions = await this.prisma.submission.findMany({
      where: { teamId },
      orderBy: {
        version: 'desc',
      },
      include: {
        team: {
          select: {
            name: true,
          },
        },
      },
    });

    return submissions.map((s) => ({
      ...s,
      teamName: s.team.name,
    }));
  }

  async findOne(id: string): Promise<Submission | null> {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!submission) {
      return null;
    }

    return {
      ...submission,
      teamName: submission.team.name,
    };
  }
}
