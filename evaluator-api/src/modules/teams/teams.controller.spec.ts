import { Test, TestingModule } from '@nestjs/testing';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { NotFoundException } from '@nestjs/common';

describe('TeamsController', () => {
  let controller: TeamsController;

  const mockTeam = {
    id: 'clh1234567890',
    name: 'Test Team',
    createdAt: new Date(),
  };

  const mockTeamsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [
        {
          provide: TeamsService,
          useValue: mockTeamsService,
        },
      ],
    }).compile();

    controller = module.get<TeamsController>(TeamsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a team', async () => {
      mockTeamsService.create.mockResolvedValue(mockTeam);

      const result = await controller.create({ name: 'Test Team' });

      expect(result).toEqual(mockTeam);
      expect(mockTeamsService.create).toHaveBeenCalledWith({
        name: 'Test Team',
      });
    });
  });

  describe('findAll', () => {
    it('should return an array of teams', async () => {
      const teams = [mockTeam];
      mockTeamsService.findAll.mockResolvedValue(teams);

      const result = await controller.findAll();

      expect(result).toEqual(teams);
    });
  });

  describe('findOne', () => {
    it('should return a team', async () => {
      mockTeamsService.findOne.mockResolvedValue(mockTeam);

      const result = await controller.findOne('clh1234567890');

      expect(result).toEqual(mockTeam);
    });

    it('should throw NotFoundException if team not found', async () => {
      mockTeamsService.findOne.mockResolvedValue(null);

      await expect(controller.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should remove a team', async () => {
      mockTeamsService.findOne.mockResolvedValue(mockTeam);
      mockTeamsService.remove.mockResolvedValue(mockTeam);

      await controller.remove('clh1234567890');

      expect(mockTeamsService.remove).toHaveBeenCalledWith('clh1234567890');
    });

    it('should throw NotFoundException if team not found', async () => {
      mockTeamsService.findOne.mockResolvedValue(null);

      await expect(controller.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
