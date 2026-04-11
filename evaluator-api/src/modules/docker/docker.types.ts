export interface BuildImageParams {
  dockerfileBuffer: Buffer;
  teamId: string;
  version: number;
  dockerfileId: string;
  onLog?: (message: string) => void;
}

export interface BuildImageResult {
  imageName: string;
  buildLog: string[];
}

export interface RunContainerParams {
  imageName: string;
  command: string[];
  mountPath: string;
  containerPath: string;
  scratchHostPath?: string;
  scratchContainerPath?: string;
  env?: string[];
  stdin?: string | null;
  memoryMb?: number;
  cpuCount?: number;
  pidsLimit?: number;
  readOnlyMount?: boolean;
  submissionId?: string;
  version?: number;
  timeoutMs?: number;
  onLog?: (message: string) => void;
}

export interface RunContainerResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
