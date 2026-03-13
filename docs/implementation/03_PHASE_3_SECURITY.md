# Phase 3: Security Hardening

**Duration: Week 4**

## Objectives

- Implement container security policies
- Configure resource limits and timeout enforcement
- Set up network isolation
- Implement defense-in-depth security measures
- Perform security testing

---

## 3.1 Security Threat Model

### Threat Vectors and Mitigations

| Threat | Mitigation | Implementation |
|--------|------------|----------------|
| Container Escape | Runtime Isolation | gVisor/Kata Containers |
| Privilege Escalation | Capability Dropping | `--cap-drop=ALL` |
| Network Exfiltration | Network Isolation | `--network none` |
| Resource Exhaustion | Resource Limits | CPU, memory, PIDs limits |
| Disk Fill Attack | Storage Quotas | Read-only + tmpfs |
| Fork Bomb | Process Limits | `--pids-limit 100` |
| Infinite Loop | Timeout Enforcement | Container + process timeout |

---

## 3.2 Container Security Configuration

### Tasks

- [ ] Define security options
- [ ] Create container security service
- [ ] Implement seccomp profiles
- [ ] Configure AppArmor/SELinux

### Complete Security Options

```typescript
interface ContainerSecurityConfig {
  networkDisabled: true;
  readOnlyRootfs: true;
  securityOpt: string[];
  capDrop: string[];
  resourceLimits: {
    memory: number;
    memorySwap: number;
    cpuPeriod: number;
    cpuQuota: number;
    pidsLimit: number;
  };
  ulimits: {
    nofile: number;
    nproc: number;
  };
  tmpfs: {
    '/tmp': string;
  };
}

const SECURITY_CONFIG: ContainerSecurityConfig = {
  networkDisabled: true,
  readOnlyRootfs: true,
  securityOpt: [
    'no-new-privileges',
    'seccomp=seccomp-profile.json',
  ],
  capDrop: ['ALL'],
  resourceLimits: {
    memory: 256 * 1024 * 1024, // 256MB
    memorySwap: 256 * 1024 * 1024,
    cpuPeriod: 100000,
    cpuQuota: 100000, // 1 CPU
    pidsLimit: 100,
  },
  ulimits: {
    nofile: 64,
    nproc: 50,
  },
  tmpfs: {
    '/tmp': 'size=10m,mode=1777',
  },
};
```

### Files

```
src/lib/security.ts
src/config/container.ts
scripts/docker/seccomp-profile.json
```

---

## 3.3 Container Creation with Security

### Tasks

- [ ] Implement secure container creation
- [ ] Apply all security constraints
- [ ] Validate security configuration
- [ ] Log security events

### Container Creation Service

```typescript
import Docker from 'dockerode';
import { SECURITY_CONFIG } from '@/config/container';

async function createSecureContainer(params: {
  imageId: string;
  sourceFilePath: string;
  testCase: TestCase;
}): Promise<Docker.Container> {
  const { imageId, sourceFilePath, testCase } = params;
  
  const container = await docker.createContainer({
    Image: imageId,
    Entrypoint: ['/scripts/run_test.sh'],
    Cmd: ['/workspace/source.lang'],
    HostConfig: {
      NetworkMode: 'none',
      Memory: SECURITY_CONFIG.resourceLimits.memory,
      MemorySwap: SECURITY_CONFIG.resourceLimits.memorySwap,
      CpuPeriod: SECURITY_CONFIG.resourceLimits.cpuPeriod,
      CpuQuota: SECURITY_CONFIG.resourceLimits.cpuQuota,
      PidsLimit: SECURITY_CONFIG.resourceLimits.pidsLimit,
      SecurityOpt: SECURITY_CONFIG.securityOpt,
      CapDrop: SECURITY_CONFIG.capDrop,
      ReadonlyRootfs: SECURITY_CONFIG.readOnlyRootfs,
      Tmpfs: SECURITY_CONFIG.tmpfs,
      Ulimits: [
        { Name: 'nofile', Hard: SECURITY_CONFIG.ulimits.nofile, Soft: SECURITY_CONFIG.ulimits.nofile },
        { Name: 'nproc', Hard: SECURITY_CONFIG.ulimits.nproc, Soft: SECURITY_CONFIG.ulimits.nproc },
      ],
      Binds: [
        `${sourceFilePath}:/workspace/source.lang:ro`,
        `${SCRIPTS_DIR}:/scripts:ro`,
      ],
    },
    User: 'nobody:nogroup',
  });
  
  return container;
}
```

### Files

```
src/services/container.ts
```

---

## 3.4 Timeout Enforcement

### Tasks

- [ ] Implement container-level timeout
- [ ] Implement process-level timeout in entrypoint
- [ ] Handle timeout gracefully
- [ ] Clean up resources on timeout

### Two-Layer Timeout Strategy

```
┌─────────────────────────────────────────────┐
│           CONTAINER TIMEOUT                  │
│  (Docker kills container after N seconds)   │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │        PROCESS TIMEOUT                 │  │
│  │  (timeout command wraps executable)   │  │
│  │                                       │  │
│  │  [Compilation] → [Execution]          │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Timeout Implementation

```typescript
const CONTAINER_TIMEOUT_BUFFER_MS = 5000; // 5 second buffer

async function executeWithTimeout(params: {
  container: Docker.Container;
  timeoutMs: number;
}): Promise<ExecutionResult> {
  const { container, timeoutMs } = params;
  const containerTimeout = timeoutMs + CONTAINER_TIMEOUT_BUFFER_MS;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new TimeoutError('Container timeout')), containerTimeout);
  });
  
  const executionPromise = runContainer(container);
  
  try {
    return await Promise.race([executionPromise, timeoutPromise]);
  } catch (err) {
    if (err instanceof TimeoutError) {
      await container.kill();
      return {
        status: 'TIMEOUT',
        stdout: '',
        stderr: 'Execution timed out',
        exitCode: 137,
        runTimeMs: timeoutMs,
      };
    }
    throw err;
  } finally {
    await container.remove({ force: true });
  }
}
```

### Updated Entrypoint Script

```bash
#!/bin/bash
# scripts/docker/run_test.sh

SOURCE_FILE="$1"
TIMEOUT_SECONDS="$2"
shift 2
ARGS="$@"
OUTPUT_BIN="/workspace/output"

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

## 3.5 Runtime Isolation

### Tasks

- [ ] Evaluate gVisor (runsc) option
- [ ] Evaluate Kata Containers option
- [ ] Configure chosen runtime
- [ ] Test isolation effectiveness

### gVisor Configuration

```bash
# Install gVisor
sudo apt install runsc

# Configure Docker to use gVisor
sudo tee /etc/docker/daemon.json <<EOF
{
  "runtimes": {
    "runsc": {
      "path": "/usr/bin/runsc"
    }
  }
}
EOF

sudo systemctl restart docker
```

### Using gVisor in Container Creation

```typescript
const container = await docker.createContainer({
  Image: imageId,
  // ... other config
  HostConfig: {
    Runtime: 'runsc', // Use gVisor
    // ... other security options
  },
});
```

### Files

```
docs/infrastructure/gvisor-setup.md
src/config/runtime.ts
```

---

## 3.6 Seccomp Profile

### Tasks

- [ ] Create restrictive seccomp profile
- [ ] Test with various operations
- [ ] Document allowed syscalls

### Seccomp Profile

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": [
        "read", "write", "close", "fstat", "mmap", "mprotect",
        "munmap", "brk", "ioctl", "access", "pipe", "dup2",
        "getpid", "socket", "connect", "sendto", "recvfrom",
        "exit_group", "arch_prctl", "gettid", "futex", "set_tid_address",
        "clock_gettime", "nanosleep", "stat", "openat", "newfstatat",
        "fcntl", "getdents64", "lseek", "getrandom", "pread64", "pwrite64"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

### Files

```
scripts/docker/seccomp-profile.json
```

---

## 3.7 User Namespace Remapping

### Tasks

- [ ] Configure Docker user namespaces
- [ ] Set up UID/GID remapping
- [ ] Test container user isolation

### Docker Daemon Configuration

```json
{
  "userns-remap": "evaluator"
}

// /etc/subuid
evaluator:100000:65536

// /etc/subgid
evaluator:100000:65536
```

---

## 3.8 Network Isolation Verification

### Tasks

- [ ] Verify containers have no network access
- [ ] Test DNS resolution blocked
- [ ] Test external connections blocked
- [ ] Document verification steps

### Verification Test

```typescript
async function verifyNetworkIsolation(container: Docker.Container): Promise<boolean> {
  const exec = await container.exec({
    Cmd: ['sh', '-c', 'ping -c 1 8.8.8.8 || exit 0'],
    AttachStdout: true,
    AttachStderr: true,
  });
  
  const stream = await exec.start({});
  const output = await streamToString(stream);
  
  // Should fail because network is disabled
  return output.includes('Network is unreachable');
}
```

---

## 3.9 Resource Limit Testing

### Tasks

- [ ] Test memory limit enforcement
- [ ] Test CPU limit enforcement
- [ ] Test process limit enforcement
- [ ] Test file descriptor limit

### Test Cases

```typescript
describe('Resource Limits', () => {
  it('should enforce memory limit', async () => {
    // Attempt to allocate more than 256MB
    const result = await executeInContainer(`
      const buf = Buffer.alloc(300 * 1024 * 1024);
    `);
    expect(result.exitCode).toBe(137); // OOM killed
  });
  
  it('should enforce process limit', async () => {
    // Fork bomb attempt
    const result = await executeInContainer(`
      :(){ :|:& };:
    `);
    expect(result.exitCode).toBeDefined();
  });
});
```

---

## 3.10 Security Logging

### Tasks

- [ ] Log all security events
- [ ] Log container lifecycle events
- [ ] Log resource usage
- [ ] Create security alerts

### Security Events to Log

```typescript
interface SecurityEvent {
  timestamp: Date;
  submissionId: string;
  containerId: string;
  event: 'created' | 'started' | 'killed' | 'timeout' | 'oom' | 'removed';
  details: {
    exitCode?: number;
    signal?: string;
    memoryUsage?: number;
    cpuUsage?: number;
  };
}

async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  logger.info('security', event);
  
  if (event.event === 'oom' || event.event === 'timeout') {
    await alertSecurityTeam(event);
  }
}
```

### Files

```
src/services/security-logging.ts
```

---

## 3.11 Host Security Requirements

### Tasks

- [ ] Document host hardening steps
- [ ] Configure firewall rules
- [ ] Set up monitoring
- [ ] Create incident response plan

### Host Hardening Checklist

- [ ] Enable SELinux/AppArmor
- [ ] Configure firewall (only required ports)
- [ ] Enable Docker logging
- [ ] Set up resource monitoring
- [ ] Configure log rotation
- [ ] Enable audit logging
- [ ] Regular security updates
- [ ] Isolate worker nodes from main network

### Files

```
docs/infrastructure/host-hardening.md
```

---

## Deliverables Checklist

- [ ] Security configuration implemented
- [ ] Timeout enforcement working
- [ ] Runtime isolation configured
- [ ] Seccomp profile created
- [ ] Network isolation verified
- [ ] Resource limits tested
- [ ] Security logging functional
- [ ] Host hardening documented

---

## Testing Phase 3

### Security Tests

```bash
npm run test -- --testPathPattern="security"
npm run test -- --testPathPattern="container"
```

### Penetration Testing

1. Attempt container escape
2. Attempt network exfiltration
3. Attempt privilege escalation
4. Test resource exhaustion
5. Test timeout bypass

### Manual Verification

1. Run container with malicious code
2. Verify no network access
3. Verify resource limits enforced
4. Verify container isolation

---

## Next Phase

→ [Phase 4: Dashboard & Real-time](./04_PHASE_4_FRONTEND.md)
