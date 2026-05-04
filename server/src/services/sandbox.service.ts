import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { CodeLanguage } from '../types/task';
import { TestRunResult } from '../types/task-submission';
import { AppError } from '../types/errors';

const PYTHON_IMAGE = process.env.SANDBOX_PYTHON_IMAGE ?? 'python:3.12-alpine';
const PASCAL_IMAGE = process.env.SANDBOX_PASCAL_IMAGE ?? 'iqdoctor/free-pascal:latest';

const TIMEOUT_SECONDS = 1;
const WALL_TIMEOUT_MS = 8_000;
const MEMORY_LIMIT = '128m';
const CPU_LIMIT = '0.5';
const PIDS_LIMIT = '64';
const OUTPUT_LIMIT = 64 * 1024;

type Limits = { cpuSeconds: number; wallMs: number };

const DEFAULT_LIMITS: Limits = {
  cpuSeconds: TIMEOUT_SECONDS,
  wallMs: WALL_TIMEOUT_MS,
};

type ContainerResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

async function runDocker(
  image: string,
  cmd: string[],
  bindDir: string,
  stdin: string,
  limits: Limits,
): Promise<ContainerResult> {
  const args = [
    'run',
    '--rm',
    '-i',
    '--network', 'none',
    '--memory', MEMORY_LIMIT,
    '--cpus', CPU_LIMIT,
    '--pids-limit', PIDS_LIMIT,
    '--read-only',
    '--tmpfs', '/tmp:size=16m,mode=1777',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '-v', `${bindDir}:/code:ro`,
    '-w', '/code',
    image,
    'sh', '-c',
    `timeout -s KILL ${limits.cpuSeconds} ${cmd.map((s) => `'${s.replace(/'/g, "'\\''")}'`).join(' ')}`,
  ];

  return new Promise<ContainerResult>((resolve) => {
    const proc = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;

    const wall = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, limits.wallMs);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= OUTPUT_LIMIT) stdout += chunk.toString('utf-8');
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= OUTPUT_LIMIT) stderr += chunk.toString('utf-8');
    });
    proc.on('error', (err) => {
      clearTimeout(wall);
      resolve({ stdout, stderr: `${stderr}\n[docker error] ${err.message}`, exitCode: null, timedOut });
    });
    proc.on('close', (code) => {
      clearTimeout(wall);
      // exit 124 = timeout; exit 137 = SIGKILL (OOM or wall kill)
      const isTimeout = timedOut || code === 124 || code === 137;
      resolve({ stdout, stderr, exitCode: code, timedOut: isTimeout });
    });

    if (stdin) proc.stdin.write(stdin);
    proc.stdin.end();
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function normalizeOutput(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[\t ]+\n/g, '\n').replace(/\n+$/g, '');
}

async function runPython(
  code: string,
  stdin: string,
  limits: Limits,
): Promise<ContainerResult> {
  return withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'main.py'), code, 'utf-8');
    return runDocker(PYTHON_IMAGE, ['python3', 'main.py'], dir, stdin, limits);
  });
}

async function runPascal(
  code: string,
  stdin: string,
  limits: Limits,
): Promise<ContainerResult> {
  return withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, 'main.pas'), code, 'utf-8');
    // Compile to /tmp (writable), then run binary.
    // Bind mount is read-only; FPC writes binary into /tmp inside container.
    const cmd = [
      'sh',
      '-c',
      'fpc -O1 -Mobjfpc -Sh -FE/tmp main.pas >/tmp/build.log 2>&1 && /tmp/main || (cat /tmp/build.log >&2; exit 2)',
    ];
    return runDocker(PASCAL_IMAGE, cmd, dir, stdin, limits);
  });
}

async function runOnce(
  language: CodeLanguage,
  code: string,
  stdin: string,
  limits: Limits,
): Promise<ContainerResult> {
  switch (language) {
    case 'python':
      return runPython(code, stdin, limits);
    case 'pascal':
      return runPascal(code, stdin, limits);
  }
}

export async function runTestCases(
  language: CodeLanguage,
  code: string,
  cases: ReadonlyArray<{ ord: number; input: string; expected_output: string }>,
): Promise<TestRunResult[]> {
  if (typeof code !== 'string' || code.length === 0) {
    throw new AppError(400, 'Code must be a non-empty string');
  }
  if (code.length > 200_000) {
    throw new AppError(400, 'Code is too large (max 200KB)');
  }

  const results: TestRunResult[] = [];
  for (const tc of cases) {
    const r = await runOnce(language, code, tc.input, DEFAULT_LIMITS);
    const actual = normalizeOutput(r.stdout);
    const expected = normalizeOutput(tc.expected_output);
    const passed = !r.timedOut && r.exitCode === 0 && actual === expected;
    const result: TestRunResult = {
      ord: tc.ord,
      passed,
      input: tc.input,
      expected: tc.expected_output,
      actual: r.stdout,
      stderr: r.stderr,
      timed_out: r.timedOut,
    };
    if (r.timedOut) {
      result.error = 'Превышено время выполнения';
    } else if (r.exitCode !== 0 && r.exitCode !== null) {
      result.error = `Код завершения ${r.exitCode}`;
    } else if (r.exitCode === null) {
      result.error = 'Не удалось запустить sandbox';
    }
    results.push(result);
  }
  return results;
}
