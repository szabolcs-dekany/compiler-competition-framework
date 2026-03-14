import type { TeamDto, CreateTeamDto, TestCaseBlueprint, SubmissionDto, CreateSubmissionDto, TestRunWithDetailsDto } from '@evaluator/shared';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export const teamsApi = {
  list: () => fetchJson<TeamDto[]>(`${API_BASE}/teams`),
  
  get: (id: string) => fetchJson<TeamDto>(`${API_BASE}/teams/${id}`),
  
  create: (data: CreateTeamDto) =>
    fetchJson<TeamDto>(`${API_BASE}/teams`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    fetchJson<void>(`${API_BASE}/teams/${id}`, {
      method: 'DELETE',
    }),
};

export const testCasesApi = {
  list: () => fetchJson<TestCaseBlueprint[]>(`${API_BASE}/test-cases`),
  
  get: (id: string) => fetchJson<TestCaseBlueprint>(`${API_BASE}/test-cases/${id}`),
};

export const submissionsApi = {
  list: () => fetchJson<SubmissionDto[]>(`${API_BASE}/submissions`),
  
  get: (id: string) => fetchJson<SubmissionDto>(`${API_BASE}/submissions/${id}`),
  
  listByTeam: (teamId: string) => fetchJson<SubmissionDto[]>(`${API_BASE}/submissions/team/${teamId}`),
  
  testRuns: (submissionId: string) => fetchJson<TestRunWithDetailsDto[]>(`${API_BASE}/submissions/${submissionId}/test-runs`),
  
  create: (data: CreateSubmissionDto, file: File) => {
    const formData = new FormData();
    formData.append('teamId', data.teamId);
    formData.append('file', file);
    
    return fetchJson<SubmissionDto>(`${API_BASE}/submissions`, {
      method: 'POST',
      headers: {},
      body: formData,
    });
  },
};
