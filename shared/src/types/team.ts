import type { SubmissionDto } from './submission.js';

export interface TeamDto {
  id: string;
  name: string;
  createdAt: string;
}

export interface TeamWithSubmissionsDto extends TeamDto {
  submissions: SubmissionDto[];
}

export interface CreateTeamDto {
  name: string;
}
