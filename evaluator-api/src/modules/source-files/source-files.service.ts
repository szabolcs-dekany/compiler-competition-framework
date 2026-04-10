import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { TestCasesService } from '../test-cases/test-cases.service';
import { UploadSourceFileDto } from './dto/upload-source-file.dto';
import type {
  SourceFileDto,
  SourceFileListDto,
  SourceFileVersionDto,
  SourceFileWithTestDetails,
} from '@evaluator/shared';
import * as crypto from 'crypto';

@Injectable()
export class SourceFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly testCasesService: TestCasesService,
  ) {}

  async create(
    dto: UploadSourceFileDto,
    file: Express.Multer.File,
  ): Promise<SourceFileDto> {
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
    });
    if (!team) {
      throw new NotFoundException(`Team with id ${dto.teamId} not found`);
    }

    this.testCasesService.findOne(dto.testCaseId);

    const checksum = this.calculateChecksum(file.buffer);
    const extension = this.extractExtension(file.originalname);

    const existing = await this.prisma.sourceFile.findUnique({
      where: {
        teamId_testCaseId: {
          teamId: dto.teamId,
          testCaseId: dto.testCaseId,
        },
      },
    });

    const version = existing ? existing.version + 1 : 1;
    const s3Key = `source-files/${dto.teamId}/${dto.testCaseId}/v${version}`;

    await this.storage.uploadFile(s3Key, file.buffer, file.mimetype);

    if (existing) {
      await this.prisma.sourceFileVersion.create({
        data: {
          sourceFileId: existing.id,
          version,
          s3Key,
          size: file.size,
          checksum,
        },
      });

      const updated = await this.prisma.sourceFile.update({
        where: { id: existing.id },
        data: {
          originalName: file.originalname,
          extension,
          s3Key,
          size: file.size,
          checksum,
          version,
          uploadedAt: new Date(),
        },
      });

      return this.toDto(updated);
    }

    const sourceFile = await this.prisma.sourceFile.create({
      data: {
        teamId: dto.teamId,
        testCaseId: dto.testCaseId,
        originalName: file.originalname,
        extension,
        s3Key,
        size: file.size,
        checksum,
        version,
      },
    });

    await this.prisma.sourceFileVersion.create({
      data: {
        sourceFileId: sourceFile.id,
        version,
        s3Key,
        size: file.size,
        checksum,
      },
    });

    return this.toDto(sourceFile);
  }

  async findAll(teamId: string): Promise<SourceFileListDto> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });
    if (!team) {
      throw new NotFoundException(`Team with id ${teamId} not found`);
    }

    const allTestCases = this.testCasesService.findAll();
    const sourceFiles = await this.prisma.sourceFile.findMany({
      where: { teamId },
    });

    const sourceFileMap = new Map(sourceFiles.map((sf) => [sf.testCaseId, sf]));

    const filesWithDetails: SourceFileWithTestDetails[] = [];
    const missingTestCases: string[] = [];

    for (const tc of allTestCases) {
      const sf = sourceFileMap.get(tc.id);
      if (sf) {
        filesWithDetails.push({
          ...this.toDto(sf),
          testCaseName: tc.name,
          testCaseCategory: tc.category,
        });
      } else {
        missingTestCases.push(tc.id);
      }
    }

    return {
      teamId,
      sourceFiles: filesWithDetails,
      totalTestCases: allTestCases.length,
      uploadedCount: filesWithDetails.length,
      missingTestCases,
    };
  }

  async findOne(id: string): Promise<SourceFileDto> {
    const sourceFile = await this.prisma.sourceFile.findUnique({
      where: { id },
    });

    if (!sourceFile) {
      throw new NotFoundException(`Source file with id ${id} not found`);
    }

    return this.toDto(sourceFile);
  }

  async getVersions(sourceFileId: string): Promise<SourceFileVersionDto[]> {
    const sourceFile = await this.prisma.sourceFile.findUnique({
      where: { id: sourceFileId },
    });

    if (!sourceFile) {
      throw new NotFoundException(
        `Source file with id ${sourceFileId} not found`,
      );
    }

    const versions = await this.prisma.sourceFileVersion.findMany({
      where: { sourceFileId },
      orderBy: { version: 'desc' },
    });

    return versions.map((v) => ({
      id: v.id,
      sourceFileId: v.sourceFileId,
      version: v.version,
      size: v.size,
      checksum: v.checksum,
      uploadedAt: v.uploadedAt.toISOString(),
    }));
  }

  async download(id: string): Promise<{ buffer: Buffer; fileName: string }> {
    const sourceFile = await this.prisma.sourceFile.findUnique({
      where: { id },
    });

    if (!sourceFile) {
      throw new NotFoundException(`Source file with id ${id} not found`);
    }

    const buffer = await this.storage.getFile(sourceFile.s3Key);
    const fileName = `${sourceFile.testCaseId}${sourceFile.extension}`;

    return { buffer, fileName };
  }

  async downloadVersion(
    sourceFileId: string,
    version: number,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const sourceFile = await this.prisma.sourceFile.findUnique({
      where: { id: sourceFileId },
    });

    if (!sourceFile) {
      throw new NotFoundException(
        `Source file with id ${sourceFileId} not found`,
      );
    }

    const versionRecord = await this.prisma.sourceFileVersion.findUnique({
      where: {
        sourceFileId_version: {
          sourceFileId,
          version,
        },
      },
    });

    if (!versionRecord) {
      throw new NotFoundException(
        `Version ${version} not found for source file ${sourceFileId}`,
      );
    }

    const buffer = await this.storage.getFile(versionRecord.s3Key);
    const fileName = `${sourceFile.testCaseId}_v${version}${sourceFile.extension}`;

    return { buffer, fileName };
  }

  async update(id: string, file: Express.Multer.File): Promise<SourceFileDto> {
    const existing = await this.prisma.sourceFile.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Source file with id ${id} not found`);
    }

    const checksum = this.calculateChecksum(file.buffer);
    const extension = this.extractExtension(file.originalname);
    const newVersion = existing.version + 1;
    const s3Key = `source-files/${existing.teamId}/${existing.testCaseId}/v${newVersion}`;

    await this.storage.uploadFile(s3Key, file.buffer, file.mimetype);

    await this.prisma.sourceFileVersion.create({
      data: {
        sourceFileId: existing.id,
        version: newVersion,
        s3Key,
        size: file.size,
        checksum,
      },
    });

    const updated = await this.prisma.sourceFile.update({
      where: { id },
      data: {
        originalName: file.originalname,
        extension,
        s3Key,
        size: file.size,
        checksum,
        version: newVersion,
        uploadedAt: new Date(),
      },
    });

    return this.toDto(updated);
  }

  async findByTeamId(teamId: string): Promise<SourceFileDto[] | null> {
    const sourceFiles = await this.prisma.sourceFile.findMany({
      where: { teamId },
    });

    return sourceFiles.length > 0
      ? sourceFiles.map((sf) => this.toDto(sf))
      : null;
  }

  private toDto(sf: {
    id: string;
    teamId: string;
    testCaseId: string;
    originalName: string;
    extension: string;
    size: number;
    checksum: string;
    version: number;
    s3Key: string;
    uploadedAt: Date;
  }): SourceFileDto {
    return {
      id: sf.id,
      teamId: sf.teamId,
      testCaseId: sf.testCaseId,
      originalName: sf.originalName,
      extension: sf.extension,
      size: sf.size,
      checksum: sf.checksum?.slice(0, 8) ?? sf.checksum,
      version: sf.version,
      s3Key: sf.s3Key,
      uploadedAt: sf.uploadedAt.toISOString(),
    };
  }

  private calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private extractExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === 0) {
      return '';
    }
    return filename.slice(lastDot);
  }
}
