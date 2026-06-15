import { join } from 'node:path';
import { spawn as defaultSpawn, type ChildProcess } from 'node:child_process';
import { logger as defaultLogger } from './logger.js';
import { findNexusBinary, type BinaryResolution } from './nexus-spawn.js';
import { getFreePort as defaultGetFreePort } from './port-resolver.js';
import { parseDaemonState, serializeDaemonState, type DaemonState } from './daemon-state.js';

export interface Logger {
  warn(msg: string): void;
  info(msg: string): void;
  error(msg: string): void;
}

export interface FsLike {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  unlink(path: string): Promise<void>;
  open(path: string, flags: string): Promise<number>;
}

export interface EnsureDaemonOptions {
  repoRoot: string;
  env: NodeJS.ProcessEnv;
  findBinary?: () => Promise<BinaryResolution>;
  getFreePort?: () => Promise<number>;
  fetch?: typeof globalThis.fetch;
  fs?: FsLike;
  spawn?: typeof defaultSpawn;
  logger?: Logger;
  readyTimeoutMs?: number;
  readyIntervalMs?: number;
}

const DEFAULT_READY_TIMEOUT_MS = 30_000;
const DEFAULT_READY_INTERVAL_MS = 500;
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 1_000;

export function getDaemonStatePath(repoRoot: string): string {
  return join(repoRoot, '.nexus', 'nxc-daemon.json');
}

async function createDefaultFs(): Promise<FsLike> {
  const fs = await import('node:fs/promises');
  return {
    readFile: (path, encoding) => fs.readFile(path, encoding) as Promise<string>,
    writeFile: (path, content) => fs.writeFile(path, content),
    unlink: (path) => fs.unlink(path),
    open: (path, flags) => fs.open(path, flags).then((handle) => handle.fd),
  };
}

function errorToString(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readDaemonStateFile(fs: FsLike, path: string): Promise<DaemonState | null> {
  try {
    const content = await fs.readFile(path, 'utf8');
    return parseDaemonState(content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

async function isDaemonAlive(
  fetch: typeof globalThis.fetch,
  port: number,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  abortSignal?.addEventListener('abort', onAbort);
  try {
    await fetch(`http://127.0.0.1:${port}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '', files: [] }),
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    abortSignal?.removeEventListener('abort', onAbort);
  }
}

function waitForDaemon(
  fetch: typeof globalThis.fetch,
  port: number,
  timeoutMs: number,
  intervalMs: number,
  abortSignal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const onAbort = () => {
      reject(new Error('Nexus daemon start aborted'));
    };
    abortSignal?.addEventListener('abort', onAbort);

    let currentIntervalMs = intervalMs;
    const check = async () => {
      await Promise.resolve();
      const elapsed = Date.now() - start;
      if (elapsed >= timeoutMs) {
        reject(
          new Error(`Nexus daemon did not become ready on port ${port} within ${timeoutMs}ms`),
        );
        return;
      }
      if (
        await isDaemonAlive(
          fetch,
          port,
          Math.min(currentIntervalMs, timeoutMs - elapsed),
          abortSignal,
        )
      ) {
        resolve();
        return;
      }
      setTimeout(check, currentIntervalMs);
      currentIntervalMs = Math.min(currentIntervalMs * 1.5, 5000);
    };
    setTimeout(check, 0);

    return () => {
      abortSignal?.removeEventListener('abort', onAbort);
    };
  });
}

export async function ensureDaemon(options: EnsureDaemonOptions): Promise<{ port: number }> {
  const {
    repoRoot,
    env,
    findBinary = () => findNexusBinary(env, repoRoot),
    getFreePort = defaultGetFreePort,
    fetch = globalThis.fetch,
    fs = await createDefaultFs(),
    spawn = defaultSpawn,
    logger = defaultLogger,
    readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
    readyIntervalMs = DEFAULT_READY_INTERVAL_MS,
  } = options;

  const statePath = getDaemonStatePath(repoRoot);

  const existingState = await readDaemonStateFile(fs, statePath);
  if (existingState) {
    if (await isDaemonAlive(fetch, existingState.port, DEFAULT_HEALTH_CHECK_TIMEOUT_MS)) {
      return { port: existingState.port };
    }
    logger.warn(
      `既存の Nexus daemon (pid=${existingState.pid}, port=${existingState.port}) に接続できません。新規に起動します。`,
    );
    await fs.unlink(statePath).catch(() => {});
  }

  const { binary, isNpxFallback } = await findBinary();
  if (isNpxFallback) {
    logger.warn(
      'nexus バイナリが見つからないため、npx @yohi/nexus を使用します。認証・依存関係のダウンロードに時間がかかる場合があります。',
    );
  }

  const nodeMajor = parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (nodeMajor < 24) {
    throw new Error(`Nexus daemon requires Node.js >= 24 (current: ${process.versions.node})`);
  }

  let logFd: number | null = null;
  const logFile = env.NEXUS_LOG_FILE;
  if (logFile) {
    try {
      logFd = await fs.open(logFile, 'a');
    } catch (err) {
      logger.warn(
        `NEXUS_LOG_FILE のオープンに失敗しました (${errorToString(err)})。ログは出力されません。`,
      );
    }
  }

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const port = await getFreePort();

    const child = spawn(binary, ['--port', String(port), '--project-root', repoRoot], {
      detached: true,
      stdio: logFd !== null ? ['ignore', logFd, logFd] : 'ignore',
      env,
    }) as ChildProcess;

    child.unref();

    const abortController = new AbortController();
    let exitError: Error | undefined;
    const onExit = (code: number | null) => {
      exitError = new Error(`Nexus daemon exited prematurely with code ${code}`);
      abortController.abort();
    };
    const onError = (err: Error) => {
      exitError = new Error(`Nexus daemon failed to start: ${err.message}`);
      abortController.abort();
    };
    child.once('exit', onExit);
    child.once('error', onError);

    try {
      await waitForDaemon(fetch, port, readyTimeoutMs, readyIntervalMs, abortController.signal);

      const state: DaemonState = {
        port,
        pid: child.pid ?? 0,
        startedAt: new Date().toISOString(),
      };
      await fs.writeFile(statePath, serializeDaemonState(state));

      return { port };
    } catch (err) {
      const finalErr = exitError ?? err;
      if (attempt === MAX_RETRIES) {
        throw finalErr;
      }
      logger.warn(
        `ポート ${port} での起動に失敗しました (${errorToString(finalErr)})。再試行します...`,
      );
    } finally {
      child.off('exit', onExit);
      child.off('error', onError);
    }
  }

  throw new Error('Unreachable');
}
