# Docker Execution

## Overview

The framework executes team submissions in isolated Docker containers. Each submission is built into a Docker image, then executed for each test case with strict security constraints.

---

## Container Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload    │────▶│    Build    │────▶│   Execute   │────▶│   Cleanup   │
│  Archive    │     │   Image     │     │  Containers │     │  Resources  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

## Image Building

### Build Process

```typescript
async function buildDockerImage(params: {
  submissionId: string;
  compilerPath: string;
}): Promise<string> {
  const { submissionId, compilerPath } = params;
  
  // 1. Download compiler archive from S3
  const archive = await s3.download(compilerPath);
  
  // 2. Extract to temporary directory
  const buildDir = await extractArchive(archive);
  
  // 3. Build Docker image
  const imageId = `team-compiler-${submissionId}`;
  
  const stream = await docker.buildImage(
    { context: buildDir, src: ['.'] },
    { t: imageId }
  );
  
  await streamToPromise(stream);
  
  // 4. Cleanup build directory
  await fs.rm(buildDir, { recursive: true });
  
  return imageId;
}
```

### Dockerfile Requirements

Teams must provide a Dockerfile that:
- Sets up the compilation environment
- Copies compiler files to `/compiler/`
- Builds the compiler (if needed)
- Sets WORKDIR to `/workspace`

**Example Dockerfile:**

```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    build-essential \
    nasm \
    && rm -rf /var/lib/apt/lists/*

COPY compiler/ /compiler/
RUN cd /compiler && make

WORKDIR /workspace
```

### compile.sh Contract

The `compile.sh` script must:
- Accept `$1` as source file path
- Accept `$2` as output binary path
- Return exit code 0 on success
- Return exit code 1 on compilation error
- Return exit code 2 on internal error

```bash
#!/bin/bash
SOURCE_FILE="$1"
OUTPUT_BIN="$2"

/compiler/bin/mycompiler "$SOURCE_FILE" -o "$OUTPUT_BIN"
exit $?
```

---

## Container Execution

### Execution Command

```bash
docker run --rm \
  --entrypoint "/scripts/run_test.sh" \
  --network none \
  --cpus="1" \
  --memory="256m" \
  --memory-swap="256m" \
  --pids-limit 100 \
  --security-opt=no-new-privileges \
  --cap-drop=ALL \
  --read-only \
  --tmpfs /tmp:size=10m,mode=1777 \
  --ulimit nofile=64:64 \
  --ulimit nproc=50:50 \
  -v "$SOURCE_PATH:/workspace/source.lang:ro" \
  -v "$SCRIPTS_DIR:/scripts:ro" \
  team-compiler-$SUBMISSION_ID \
  /workspace/source.lang \
  $TIMEOUT_SECONDS \
  $ARGS
```

### Security Options Explained

| Option | Purpose |
|--------|---------|
| `--network none` | No network access |
| `--cpus="1"` | Limit to 1 CPU |
| `--memory="256m"` | Memory limit |
| `--memory-swap="256m"` | Disable swap |
| `--pids-limit 100` | Prevent fork bombs |
| `--security-opt=no-new-privileges` | Prevent privilege escalation |
| `--cap-drop=ALL` | Drop all capabilities |
| `--read-only` | Read-only filesystem |
| `--tmpfs /tmp` | Writable temp directory |
| `--ulimit nofile=64` | File descriptor limit |
| `--ulimit nproc=50` | Process count limit |

---

## Injected Entrypoint

### run_test.sh

```bash
#!/bin/bash
# Framework-injected evaluation entrypoint

SOURCE_FILE="$1"
TIMEOUT_SECONDS="$2"
shift 2
ARGS="$@"
OUTPUT_BIN="/workspace/output"

# Phase 1: Compilation
echo "=== COMPILATION PHASE ==="
timeout ${TIMEOUT_SECONDS}s /compile.sh "$SOURCE_FILE" "$OUTPUT_BIN"
COMPILE_EXIT=$?

if [ $COMPILE_EXIT -ne 0 ]; then
    if [ $COMPILE_EXIT -eq 124 ]; then
        echo "COMPILATION_TIMEOUT"
        exit 124
    fi
    echo "COMPILATION_FAILED:$COMPILE_EXIT"
    exit 100
fi

# Phase 2: Execution
echo "=== EXECUTION PHASE ==="
chmod +x "$OUTPUT_BIN"
timeout ${TIMEOUT_SECONDS}s "$OUTPUT_BIN" $ARGS
EXEC_EXIT=$?

if [ $EXEC_EXIT -eq 124 ]; then
    echo "EXECUTION_TIMEOUT"
    exit 137
fi

exit $EXEC_EXIT
```

---

## Exit Code Mapping

| Container Exit Code | Status | Description |
|---------------------|--------|-------------|
| 0 | PASSED | Successful execution |
| 100 | COMPILATION_FAILED | Compiler error |
| 124 | COMPILATION_TIMEOUT | Compilation timed out |
| 137 | TIMEOUT | Execution timed out |
| 139 | RUNTIME_ERROR | Segmentation fault |
| Other | FAILED | Other error |

---

## Execution Service

### Implementation

```typescript
interface ExecutionParams {
  imageId: string;
  sourceFilePath: string;
  timeoutMs: number;
  maxMemoryMb: number;
  args: string[];
  stdin: string | null;
}

interface ExecutionResult {
  status: TestRunStatus;
  stdout: string;
  stderr: string;
  exitCode: number;
  compileSuccess?: boolean;
  compileTimeMs?: number;
  runSuccess?: boolean;
  runTimeMs?: number;
  errorMessage?: string;
}

async function executeTest(params: ExecutionParams): Promise<ExecutionResult> {
  const { imageId, sourceFilePath, timeoutMs, maxMemoryMb, args, stdin } = params;
  
  const container = await docker.createContainer({
    Image: imageId,
    Entrypoint: ['/scripts/run_test.sh'],
    Cmd: ['/workspace/source.lang', String(Math.ceil(timeoutMs / 2000)), ...args],
    HostConfig: {
      NetworkMode: 'none',
      Memory: maxMemoryMb * 1024 * 1024,
      MemorySwap: maxMemoryMb * 1024 * 1024,
      CpuPeriod: 100000,
      CpuQuota: 100000,
      PidsLimit: 100,
      SecurityOpt: ['no-new-privileges'],
      CapDrop: ['ALL'],
      ReadonlyRootfs: true,
      Tmpfs: { '/tmp': 'size=10m,mode=1777' },
      Ulimits: [
        { Name: 'nofile', Hard: 64, Soft: 64 },
        { Name: 'nproc', Hard: 50, Soft: 50 },
      ],
      Binds: [
        `${sourceFilePath}:/workspace/source.lang:ro`,
        `${SCRIPTS_DIR}:/scripts:ro`,
      ],
    },
    User: 'nobody:nogroup',
  });
  
  const startTime = Date.now();
  
  try {
    await container.start();
    
    // Wait for container with timeout
    const result = await waitForContainer(container, timeoutMs + 5000);
    
    const endTime = Date.now();
    
    return {
      ...result,
      runTimeMs: endTime - startTime,
    };
  } finally {
    await container.remove({ force: true });
  }
}

async function waitForContainer(
  container: Docker.Container,
  timeoutMs: number
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const timeout = setTimeout(async () => {
      await container.kill();
      resolve({
        status: 'TIMEOUT',
        stdout: '',
        stderr: 'Execution timed out',
        exitCode: 137,
      });
    }, timeoutMs);
    
    container.wait(async (err, data) => {
      clearTimeout(timeout);
      
      if (err) {
        resolve({
          status: 'ERROR',
          stdout: '',
          stderr: err.message,
          exitCode: -1,
          errorMessage: err.message,
        });
        return;
      }
      
      const logs = await container.logs({
        stdout: true,
        stderr: true,
      });
      
      const { stdout, stderr } = parseLogs(logs);
      const exitCode = data?.StatusCode ?? -1;
      
      resolve({
        status: mapExitCodeToStatus(exitCode),
        stdout,
        stderr,
        exitCode,
        compileSuccess: !stdout.includes('COMPILATION_FAILED'),
        runSuccess: exitCode === 0,
      });
    });
  });
}
```

---

## Resource Cleanup

### Cleanup Service

```typescript
async function cleanupSubmissionResources(submissionId: string): Promise<void> {
  const imageId = `team-compiler-${submissionId}`;
  
  try {
    // Remove Docker image
    const image = docker.getImage(imageId);
    await image.remove({ force: true });
  } catch (err) {
    // Image may not exist
  }
  
  // Remove S3 artifacts
  await s3.deletePrefix(`submissions/${submissionId}/`);
}
```

### Cleanup Job

```typescript
interface CleanupJobData {
  submissionId: string;
  imageId?: string;
  containerIds?: string[];
}

export const cleanupWorker = new Worker<CleanupJobData>(
  'cleanup',
  async (job) => {
    const { submissionId, imageId, containerIds } = job.data;
    
    // Remove containers
    if (containerIds) {
      for (const containerId of containerIds) {
        try {
          await docker.getContainer(containerId).remove({ force: true });
        } catch {}
      }
    }
    
    // Remove image
    if (imageId) {
      try {
        await docker.getImage(imageId).remove({ force: true });
      } catch {}
    }
    
    // Schedule S3 cleanup after retention period
    await scheduleS3Cleanup(submissionId);
  },
  { connection: redis }
);
```

---

## Runtime Isolation Options

### gVisor (runsc)

```bash
# Install gVisor
sudo apt install runsc

# Configure Docker
echo '{
  "runtimes": {
    "runsc": { "path": "/usr/bin/runsc" }
  }
}' | sudo tee /etc/docker/daemon.json

sudo systemctl restart docker
```

```typescript
const container = await docker.createContainer({
  // ...
  HostConfig: {
    Runtime: 'runsc',
    // ...
  },
});
```

### Kata Containers

```bash
# Install Kata Containers
sudo apt install kata-runtime kata-containers

# Configure Docker
echo '{
  "runtimes": {
    "kata": { "path": "/usr/bin/kata-runtime" }
  }
}' | sudo tee /etc/docker/daemon.json
```

---

## Monitoring

### Container Metrics

```typescript
async function getContainerStats(container: Docker.Container): Promise<ContainerStats> {
  const stream = await container.stats({ stream: false });
  const stats = JSON.parse(stream);
  
  return {
    cpuUsage: stats.cpu_stats.cpu_usage.total_usage,
    memoryUsage: stats.memory_stats.usage,
    memoryLimit: stats.memory_stats.limit,
    networkRx: stats.networks?.eth0?.rx_bytes ?? 0,
    networkTx: stats.networks?.eth0?.tx_bytes ?? 0,
  };
}
```

### Event Logging

```typescript
interface ContainerEvent {
  timestamp: Date;
  submissionId: string;
  containerId: string;
  event: 'create' | 'start' | 'die' | 'destroy';
  exitCode?: number;
  oomKilled?: boolean;
}

docker.getEvents({}, (err, stream) => {
  stream.on('data', (chunk) => {
    const event = JSON.parse(chunk.toString());
    logContainerEvent(event);
  });
});
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Image build fails | Invalid Dockerfile | Check build logs |
| Container OOM killed | Memory limit exceeded | Increase limit or optimize code |
| Timeout | Infinite loop | Check for loops/recursion |
| Permission denied | File permissions | Check file modes in image |
| No such file | Missing compile.sh | Verify archive structure |

### Debug Commands

```bash
# List images
docker images | grep team-compiler

# List running containers
docker ps

# View container logs
docker logs <container_id>

# Inspect container
docker inspect <container_id>

# Execute in container (for debugging)
docker exec -it <container_id> /bin/sh
```
