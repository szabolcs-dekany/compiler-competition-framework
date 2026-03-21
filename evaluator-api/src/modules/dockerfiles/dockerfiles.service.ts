import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { UploadDockerfileDto } from './dto/upload-dockerfile.dto';
import type {
  DockerfileDto,
  DockerfileListDto,
  DockerfileVersionDto,
} from '@evaluator/shared';
import * as crypto from 'crypto';
import { DockerfileQueueService } from '../queue/dockerfile-queue.service';

const DOCKERFILE_FILENAME = 'Dockerfile';

@Injectable()
export class DockerfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly dockerfileQueueService: DockerfileQueueService,
  ) {}

  async findAll(): Promise<DockerfileListDto[]> {
    const dockerfiles = await this.prisma.dockerfile.findMany({
      include: { team: true },
      orderBy: { uploadedAt: 'desc' },
    });

    return dockerfiles.map((df) => ({
      id: df.id,
      teamId: df.teamId,
      teamName: df.team.name,
      size: df.size,
      checksum: df.checksum,
      version: df.version,
      uploadedAt: df.uploadedAt.toISOString(),
    }));
  }

  async findAllByTeamId(teamId: string): Promise<DockerfileDto[]> {
    const dockerfiles = await this.prisma.dockerfile.findMany({
      where: { teamId: teamId },
      include: { team: true },
      orderBy: { uploadedAt: 'desc' },
    });

    return dockerfiles.map((df) => this.toDto(df));
  }

  async create(
    dto: UploadDockerfileDto,
    file: Express.Multer.File,
  ): Promise<DockerfileDto> {
    if (file.originalname !== DOCKERFILE_FILENAME) {
      throw new BadRequestException(
        `File must be named "${DOCKERFILE_FILENAME}"`,
      );
    }

    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
    });
    if (!team) {
      throw new NotFoundException(`Team with id ${dto.teamId} not found`);
    }

    const checksum = this.calculateChecksum(file.buffer);

    const existing = await this.prisma.dockerfile.findUnique({
      where: { teamId: dto.teamId },
    });

    const version = existing ? existing.version + 1 : 1;
    const s3Key = `dockerfiles/${dto.teamId}/v${version}`;

    await this.storage.uploadFile(s3Key, file.buffer, file.mimetype);

    if (existing) {
      await this.prisma.dockerfileVersion.create({
        data: {
          dockerfileId: existing.id,
          version,
          s3Key,
          size: file.size,
          checksum,
        },
      });

      const updated = await this.prisma.dockerfile.update({
        where: { id: existing.id },
        data: {
          s3Key,
          size: file.size,
          checksum,
          version,
          uploadedAt: new Date(),
        },
      });

      await this.dockerfileQueueService.dispatchDockerfileJob({
        dockerfileId: updated.id,
        teamId: dto.teamId,
        version: version,
      });

      return this.toDto(updated);
    }

    const dockerfile = await this.prisma.dockerfile.create({
      data: {
        teamId: dto.teamId,
        originalName: file.originalname,
        s3Key,
        size: file.size,
        checksum,
        version,
      },
    });

    await this.prisma.dockerfileVersion.create({
      data: {
        dockerfileId: dockerfile.id,
        version,
        s3Key,
        size: file.size,
        checksum,
      },
    });

    await this.dockerfileQueueService.dispatchDockerfileJob({
      dockerfileId: dockerfile.id,
      teamId: dto.teamId,
      version: version,
    });

    return this.toDto(dockerfile);
  }

  async findByTeamId(teamId: string): Promise<DockerfileDto | null> {
    const dockerfile = await this.prisma.dockerfile.findUnique({
      where: { teamId },
    });

    return dockerfile ? this.toDto(dockerfile) : null;
  }

  async findOne(id: string): Promise<DockerfileDto> {
    const dockerfile = await this.prisma.dockerfile.findUnique({
      where: { id },
    });

    if (!dockerfile) {
      throw new NotFoundException(`Dockerfile with id ${id} not found`);
    }

    return this.toDto(dockerfile);
  }

  async getVersions(dockerfileId: string): Promise<DockerfileVersionDto[]> {
    const dockerfile = await this.prisma.dockerfile.findUnique({
      where: { id: dockerfileId },
    });

    if (!dockerfile) {
      throw new NotFoundException(
        `Dockerfile with id ${dockerfileId} not found`,
      );
    }

    const versions = await this.prisma.dockerfileVersion.findMany({
      where: { dockerfileId },
      orderBy: { version: 'desc' },
    });

    return versions.map((v) => ({
      id: v.id,
      dockerfileId: v.dockerfileId,
      version: v.version,
      size: v.size,
      checksum: v.checksum,
      uploadedAt: v.uploadedAt.toISOString(),
    }));
  }

  async download(id: string): Promise<{ buffer: Buffer; fileName: string }> {
    const dockerfile = await this.prisma.dockerfile.findUnique({
      where: { id },
    });

    if (!dockerfile) {
      throw new NotFoundException(`Dockerfile with id ${id} not found`);
    }

    const buffer = await this.storage.getFile(dockerfile.s3Key);

    return { buffer, fileName: dockerfile.originalName };
  }

  async downloadVersion(
    dockerfileId: string,
    version: number,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const dockerfile = await this.prisma.dockerfile.findUnique({
      where: { id: dockerfileId },
    });

    if (!dockerfile) {
      throw new NotFoundException(
        `Dockerfile with id ${dockerfileId} not found`,
      );
    }

    const versionRecord = await this.prisma.dockerfileVersion.findUnique({
      where: {
        dockerfileId_version: {
          dockerfileId,
          version,
        },
      },
    });

    if (!versionRecord) {
      throw new NotFoundException(
        `Version ${version} not found for dockerfile ${dockerfileId}`,
      );
    }

    const buffer = await this.storage.getFile(versionRecord.s3Key);
    const fileName = `Dockerfile_v${version}`;

    return { buffer, fileName };
  }

  async update(id: string, file: Express.Multer.File): Promise<DockerfileDto> {
    if (file.originalname !== DOCKERFILE_FILENAME) {
      throw new BadRequestException(
        `File must be named "${DOCKERFILE_FILENAME}"`,
      );
    }

    const existing = await this.prisma.dockerfile.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Dockerfile with id ${id} not found`);
    }

    const checksum = this.calculateChecksum(file.buffer);
    const newVersion = existing.version + 1;
    const s3Key = `dockerfiles/${existing.teamId}/v${newVersion}`;

    await this.storage.uploadFile(s3Key, file.buffer, file.mimetype);

    await this.prisma.dockerfileVersion.create({
      data: {
        dockerfileId: existing.id,
        version: newVersion,
        s3Key,
        size: file.size,
        checksum,
      },
    });

    const updated = await this.prisma.dockerfile.update({
      where: { id },
      data: {
        s3Key,
        size: file.size,
        checksum,
        version: newVersion,
        uploadedAt: new Date(),
      },
    });

    await this.dockerfileQueueService.dispatchDockerfileJob({
      dockerfileId: updated.id,
      teamId: existing.teamId,
      version: newVersion,
    });

    return this.toDto(updated);
  }

  async updateImageName(id: string, imageName: string): Promise<DockerfileDto> {
    const updated = await this.prisma.dockerfile.update({
      where: { id },
      data: { imageName },
    });
    return this.toDto(updated);
  }

  private toDto(df: {
    id: string;
    teamId: string;
    originalName: string;
    size: number;
    checksum: string;
    version: number;
    uploadedAt: Date;
    s3Key: string;
    imageName?: string | null;
  }): DockerfileDto {
    return {
      id: df.id,
      teamId: df.teamId,
      originalName: df.originalName,
      size: df.size,
      checksum: df.checksum,
      version: df.version,
      uploadedAt: df.uploadedAt.toISOString(),
      s3Key: df.s3Key,
      imageName: df.imageName,
    };
  }

  private calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
