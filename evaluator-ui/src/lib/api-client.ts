import type {
  TeamDto,
  CreateTeamDto,
  TestCaseBlueprint,
  SubmissionDto,
  CreateSubmissionDto,
  SubmissionCompilationDto,
  SourceFileDto,
  SourceFileListDto,
  UploadSourceFileDto,
  SourceFileVersionDto,
  DockerfileDto,
  DockerfileListDto,
  DockerfileVersionDto,
  TestRunDto,
  TestRunAttemptDto,
} from '@evaluator/shared';

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
  
  compilations: (submissionId: string) => fetchJson<SubmissionCompilationDto[]>(`${API_BASE}/submissions/${submissionId}/compilations`),

  testRuns: (submissionId: string) => fetchJson<TestRunDto[]>(`${API_BASE}/submissions/${submissionId}/test-runs`),

  testRunAttempts: (submissionId: string, testCaseId: string) =>
    fetchJson<TestRunAttemptDto[]>(`${API_BASE}/submissions/${submissionId}/test-runs/${testCaseId}/attempts`),
  
  getCompileLogs: (id: string) => fetchJson<{ logs: string }>(`${API_BASE}/submissions/${id}/compile-logs`),
  
  getCompileLogStreamUrl: (id: string) => `${API_BASE}/submissions/${id}/compile-logs/stream`,
  
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

export const sourceFilesApi = {
  list: (teamId: string) => fetchJson<SourceFileListDto>(`${API_BASE}/source-files?teamId=${teamId}`),
  
  get: (id: string) => fetchJson<SourceFileDto>(`${API_BASE}/source-files/${id}`),
  
  getVersions: (id: string) => fetchJson<SourceFileVersionDto[]>(`${API_BASE}/source-files/${id}/versions`),
  
  download: (id: string) => fetch(`${API_BASE}/source-files/${id}/download`).then((r) => r.blob()),
  
  downloadVersion: (id: string, version: number) => fetch(`${API_BASE}/source-files/${id}/versions/${version}/download`).then((r) => r.blob()),
  
  upload: (data: UploadSourceFileDto, file: File) => {
    const formData = new FormData();
    formData.append('teamId', data.teamId);
    formData.append('testCaseId', data.testCaseId);
    formData.append('file', file);
    return fetchJson<SourceFileDto>(`${API_BASE}/source-files`, {
      method: 'POST',
      headers: {},
      body: formData,
    });
  },
  
  replace: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchJson<SourceFileDto>(`${API_BASE}/source-files/${id}`, {
      method: 'PUT',
      headers: {},
      body: formData,
    });
  },
};

export const dockerfilesApi = {
  list: () => fetchJson<DockerfileListDto[]>(`${API_BASE}/dockerfiles`),

  getByTeam: (teamId: string) => fetchJson<DockerfileDto>(`${API_BASE}/dockerfiles/by-team?teamId=${teamId}`),

  getById: (id: string) => fetchJson<DockerfileDto>(`${API_BASE}/dockerfiles/${id}`),

  getVersions: (id: string) => fetchJson<DockerfileVersionDto[]>(`${API_BASE}/dockerfiles/${id}/versions`),

  getVersion: (id: string, version: number) => fetchJson<DockerfileVersionDto>(`${API_BASE}/dockerfiles/${id}/versions/${version}`),

  getBuildLogs: (id: string, version: number) => fetchJson<{ logs: string }>(`${API_BASE}/dockerfiles/${id}/versions/${version}/logs`),

  getBuildLogStreamUrl: (id: string, version: number) => `${API_BASE}/dockerfiles/${id}/versions/${version}/logs/stream`,

  download: (id: string) => fetch(`${API_BASE}/dockerfiles/${id}/download`).then((r) => r.blob()),

  downloadVersion: (id: string, version: number) => fetch(`${API_BASE}/dockerfiles/${id}/versions/${version}/download`).then((r) => r.blob()),

  upload: (teamId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchJson<DockerfileDto>(`${API_BASE}/dockerfiles?teamId=${teamId}`, {
      method: 'POST',
      headers: {},
      body: formData,
    });
  },

  replace: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchJson<DockerfileDto>(`${API_BASE}/dockerfiles/${id}`, {
      method: 'PUT',
      headers: {},
      body: formData,
    });
  },
};
