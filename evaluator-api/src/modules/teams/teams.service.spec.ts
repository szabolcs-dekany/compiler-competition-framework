import { Test, TestingModule } from '@nestjs/testing';
import { TeamsService } from './teams.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('TeamsService', () => {
  let service: TeamsService;

  const mockTeam = {
    id: 'clh1234567890',
    name: 'Test Team',
    createdAt: new Date(),
  };

  const mockPrismaService = {
    team: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a team', async () => {
      mockPrismaService.team.create.mockResolvedValue(mockTeam);

      const result = await service.create({ name: 'Test Team' });

      expect(result).toEqual(mockTeam);
      expect(mockPrismaService.team.create).toHaveBeenCalledWith({
        data: { name: 'Test Team' },
      });
    });
  });

  describe('findAll', () => {
    it('should return an array of teams', async () => {
      const teams = [mockTeam];
      mockPrismaService.team.findMany.mockResolvedValue(teams);

      const result = await service.findAll();

      expect(result).toEqual(teams);
      expect(mockPrismaService.team.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a team by id', async () => {
      mockPrismaService.team.findUnique.mockResolvedValue(mockTeam);

      const result = await service.findOne('clh1234567890');

      expect(result).toEqual(mockTeam);
      expect(mockPrismaService.team.findUnique).toHaveBeenCalledWith({
        where: { id: 'clh1234567890' },
      });
    });

    it('should return null if team not found', async () => {
      mockPrismaService.team.findUnique.mockResolvedValue(null);

      const result = await service.findOne('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should return a team by name', async () => {
      mockPrismaService.team.findUnique.mockResolvedValue(mockTeam);

      const result = await service.findByName('Test Team');

      expect(result).toEqual(mockTeam);
      expect(mockPrismaService.team.findUnique).toHaveBeenCalledWith({
        where: { name: 'Test Team' },
      });
    });
  });

  describe('remove', () => {
    it('should delete a team', async () => {
      mockPrismaService.team.delete.mockResolvedValue(mockTeam);

      const result = await service.remove('clh1234567890');

      expect(result).toEqual(mockTeam);
      expect(mockPrismaService.team.delete).toHaveBeenCalledWith({
        where: { id: 'clh1234567890' },
      });
    });
  });
});
