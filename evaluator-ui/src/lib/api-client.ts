import type { TeamDto, CreateTeamDto } from '@evaluator/shared';

const API_BASE = '';

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
