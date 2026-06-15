import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { ensureDaemon, type FsLike, type Logger, getDaemonStatePath } from '../src/nexus-daemon.js';
import type { ChildProcess } from 'node:child_process';

type MockResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
};

function createMockFetch(
  responses: Array<MockResponse | Error>,
): typeof fetch & { calls: { url: string; init: RequestInit | undefined }[] } {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let index = 0;
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    // eslint-disable-next-line security/detect-object-injection
    const response = responses[index];
    index = Math.min(index + 1, responses.length - 1);
    if (response === undefined) {
      throw new Error('No mock response');
    }
    if (response instanceof Error) {
      throw response;
    }
    return response;
  }) as unknown as typeof fetch & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

function createMockFs(initial: Record<string, string> = {}): FsLike & {
  mkdir: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const files = new Map<string, string>(Object.entries(initial));
  let fdCounter = 10;
  return {
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        const err = new Error(`ENOENT: ${path}`);
        (err as NodeJS.ErrnoException).code = 'ENOENT';
        throw err;
      }
      return content;
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
    unlink: vi.fn(async (path: string) => {
      files.delete(path);
    }),
    mkdir: vi.fn(async () => {}),
    open: vi.fn(async (_path: string, _flags: string) => {
      const fd = fdCounter++;
      return fd;
    }),
    close: vi.fn(async (_fd: number) => {}),
  };
}

function createMockLogger(): Logger {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  };
}

function createMockChildProcess(
  overrides: {
    pid?: number;
    exitEarly?: Error | number | null;
  } = {},
): ChildProcess & { unref: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> } {
  const events = new Map<string, ((...args: unknown[]) => void)[]>();
  const child = {
    pid: overrides.pid ?? 12345,
    unref: vi.fn(),
    kill: vi.fn(),
    once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      const list = events.get(event) ?? [];
      list.push(cb);
      events.set(event, list);
      return child;
    }),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      const list = events.get(event) ?? [];
      list.push(cb);
      events.set(event, list);
      return child;
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      const list = events.get(event);
      if (list === undefined) return child;
      events.set(
        event,
        list.filter((c) => c !== cb),
      );
      return child;
    }),
    emit: (event: string, ...args: unknown[]) => {
      for (const cb of events.get(event) ?? []) {
        cb(...args);
      }
    },
  } as unknown as ChildProcess & {
    unref: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
  };

  if (overrides.exitEarly !== undefined) {
    setTimeout(() => {
      if (overrides.exitEarly instanceof Error) {
        child.emit('error', overrides.exitEarly);
      } else {
        child.emit('exit', overrides.exitEarly);
      }
    }, 0);
  }

  return child;
}

describe('getDaemonStatePath', () => {
  test('repoRoot 配下の .nexus/nxc-daemon.json を返す', () => {
    expect(getDaemonStatePath('/repo')).toBe('/repo/.nexus/nxc-daemon.json');
  });
});

describe('ensureDaemon', () => {
  const repoRoot = '/repo';
  const statePath = '/repo/.nexus/nxc-daemon.json';

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test('既存の daemon が生存していればそのポートを再利用する', async () => {
    const fs = createMockFs({
      [statePath]: '{"port":8080,"pid":12345,"startedAt":"2026-06-15T10:00:00.000Z"}',
    });
    const mockFetch = createMockFetch([
      { ok: true, status: 200, statusText: 'OK', text: async () => '' },
    ]);
    const result = await ensureDaemon({
      repoRoot,
      env: {},
      fs,
      fetch: mockFetch,
      logger: createMockLogger(),
      nodeVersion: '24.0.0',
    });
    expect(result.port).toBe(8080);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  test('既存 daemon が死んでいれば状態ファイルを削除して新規起動する', async () => {
    const fs = createMockFs({
      [statePath]: '{"port":8080,"pid":12345,"startedAt":"2026-06-15T10:00:00.000Z"}',
    });
    const fetch = createMockFetch([
      new Error('ECONNREFUSED'),
      { ok: false, status: 400, statusText: 'Bad Request', text: async () => '' },
    ]);

    const child = createMockChildProcess({ pid: 54321 });
    const spawn = vi.fn(() => child);
    const resultPromise = ensureDaemon({
      repoRoot,
      env: {},
      fs,
      fetch,
      spawn: spawn as unknown as typeof import('node:child_process').spawn,
      getFreePort: async () => 9090,
      findBinary: async () => ({ binary: '/bin/nexus', isNpxFallback: false }),
      logger: createMockLogger(),
      readyIntervalMs: 10,
      nodeVersion: '24.0.0',
    });
    resultPromise.catch(() => {});

    await vi.advanceTimersByTimeAsync(100);
    const result = await resultPromise;

    expect(fs.unlink).toHaveBeenCalledWith(statePath);
    expect(spawn).toHaveBeenCalledWith(
      '/bin/nexus',
      ['--port', '9090', '--project-root', repoRoot],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
    expect(result.port).toBe(9090);
    expect(fs.mkdir).toHaveBeenCalledWith('/repo/.nexus', { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(statePath, expect.stringContaining('"port":9090'));
  });

  test('npx フォールバックは実行ファイルとパッケージ引数を分離して起動する', async () => {
    const fs = createMockFs();
    const child = createMockChildProcess({ pid: 54321 });
    const spawn = vi.fn(() => child);
    const resultPromise = ensureDaemon({
      repoRoot,
      env: {},
      fs,
      fetch: createMockFetch([{ ok: true, status: 200, statusText: 'OK', text: async () => '' }]),
      spawn: spawn as unknown as typeof import('node:child_process').spawn,
      getFreePort: async () => 9090,
      findBinary: async () => ({ binary: 'npx', argsPrefix: ['@yohi/nexus'], isNpxFallback: true }),
      logger: createMockLogger(),
      readyIntervalMs: 10,
      nodeVersion: '24.0.0',
    });

    await vi.advanceTimersByTimeAsync(100);
    await resultPromise;

    expect(spawn).toHaveBeenCalledWith(
      'npx',
      ['@yohi/nexus', '--port', '9090', '--project-root', repoRoot],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
  });

  test('状態ファイルがなければ新規起動する', async () => {
    const fs = createMockFs();
    const child = createMockChildProcess({ pid: 54321 });
    const spawn = vi.fn(() => child);
    const resultPromise = ensureDaemon({
      repoRoot,
      env: {},
      fs,
      fetch: createMockFetch([{ ok: true, status: 200, statusText: 'OK', text: async () => '' }]),
      spawn: spawn as unknown as typeof import('node:child_process').spawn,
      getFreePort: async () => 9090,
      findBinary: async () => ({ binary: '/bin/nexus', isNpxFallback: false }),
      logger: createMockLogger(),
      readyIntervalMs: 10,
      nodeVersion: '24.0.0',
    });

    await vi.advanceTimersByTimeAsync(100);
    const result = await resultPromise;

    expect(result.port).toBe(9090);
    expect(fs.writeFile).toHaveBeenCalledWith(statePath, expect.stringContaining('"port":9090'));
  });

  test('spawn したプロセスの pid が取得できなければ状態ファイルを書き込まない', async () => {
    const fs = createMockFs();
    const child = createMockChildProcess({ pid: 54321 });
    Object.defineProperty(child, 'pid', { value: undefined });
    const spawn = vi.fn(() => child);
    const resultPromise = ensureDaemon({
      repoRoot,
      env: {},
      fs,
      fetch: createMockFetch([{ ok: true, status: 200, statusText: 'OK', text: async () => '' }]),
      spawn: spawn as unknown as typeof import('node:child_process').spawn,
      getFreePort: async () => 9090,
      findBinary: async () => ({ binary: '/bin/nexus', isNpxFallback: false }),
      logger: createMockLogger(),
      readyIntervalMs: 10,
      nodeVersion: '24.0.0',
    });

    const assertion = expect(resultPromise).rejects.toThrow('no PID');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  test('ready 待ちの成功後に abort listener を削除する', async () => {
    const addSpy = vi.spyOn(AbortSignal.prototype, 'addEventListener');
    const removeSpy = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
    const fs = createMockFs();
    const child = createMockChildProcess({ pid: 54321 });
    const resultPromise = ensureDaemon({
      repoRoot,
      env: {},
      fs,
      fetch: createMockFetch([{ ok: true, status: 200, statusText: 'OK', text: async () => '' }]),
      spawn: vi.fn(() => child) as unknown as typeof import('node:child_process').spawn,
      getFreePort: async () => 9090,
      findBinary: async () => ({ binary: '/bin/nexus', isNpxFallback: false }),
      logger: createMockLogger(),
      readyIntervalMs: 10,
      nodeVersion: '24.0.0',
    });

    await vi.advanceTimersByTimeAsync(100);
    await resultPromise;

    expect(removeSpy).toHaveBeenCalledTimes(addSpy.mock.calls.length);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  test('spawn したプロセスが即座に exit したらエラー', async () => {
    const fs = createMockFs();
    const spawn = vi.fn(() => createMockChildProcess({ exitEarly: 1 }));

    await expect(
      ensureDaemon({
        repoRoot,
        env: {},
        fs,
        fetch: createMockFetch([]),
        spawn: spawn as unknown as typeof import('node:child_process').spawn,
        getFreePort: async () => 9090,
        findBinary: async () => ({ binary: '/bin/nexus', isNpxFallback: false }),
        logger: createMockLogger(),
        readyIntervalMs: 10,
        nodeVersion: '24.0.0',
      }),
    ).rejects.toThrow('exited');
  });

  test('ready 待ちがタイムアウトしたらエラー', async () => {
    const fs = createMockFs();
    const child = createMockChildProcess({ pid: 54321 });
    const spawn = vi.fn(() => child);

    const resultPromise = ensureDaemon({
      repoRoot,
      env: {},
      fs,
      fetch: createMockFetch([]),
      spawn: spawn as unknown as typeof import('node:child_process').spawn,
      getFreePort: async () => 9090,
      findBinary: async () => ({ binary: '/bin/nexus', isNpxFallback: false }),
      logger: createMockLogger(),
      readyTimeoutMs: 50,
      readyIntervalMs: 10,
      nodeVersion: '24.0.0',
    });

    // Attach a temporary catch handler to suppress Node's unhandled-rejection
    // warning while fake timers advance the timeout rejection.
    resultPromise.catch(() => {});

    await vi.advanceTimersByTimeAsync(200);
    await expect(resultPromise).rejects.toThrow('ready');
  });

  test('起動失敗時でも NEXUS_LOG_FILE の fd を閉じる', async () => {
    const fs = createMockFs();
    const child = createMockChildProcess({ pid: 54321 });
    const spawn = vi.fn(() => child);

    const resultPromise = ensureDaemon({
      repoRoot,
      env: { NEXUS_LOG_FILE: '/var/log/nexus.log' },
      fs,
      fetch: createMockFetch([]),
      spawn: spawn as unknown as typeof import('node:child_process').spawn,
      getFreePort: async () => 9090,
      findBinary: async () => ({ binary: '/bin/nexus', isNpxFallback: false }),
      logger: createMockLogger(),
      readyTimeoutMs: 50,
      readyIntervalMs: 10,
      nodeVersion: '24.0.0',
    });
    resultPromise.catch(() => {});

    await vi.advanceTimersByTimeAsync(200);
    await expect(resultPromise).rejects.toThrow('ready');

    expect(fs.open).toHaveBeenCalledWith('/var/log/nexus.log', 'a');
    expect(fs.close).toHaveBeenCalledWith(10);
  });

  test('NEXUS_LOG_FILE が設定されている場合は stdout/stderr をファイルにリダイレクトする', async () => {
    const fs = createMockFs();
    const child = createMockChildProcess({ pid: 54321 });
    const spawn = vi.fn(() => child);
    const resultPromise = ensureDaemon({
      repoRoot,
      env: { NEXUS_LOG_FILE: '/var/log/nexus.log' },
      fs,
      fetch: createMockFetch([{ ok: true, status: 200, statusText: 'OK', text: async () => '' }]),
      spawn: spawn as unknown as typeof import('node:child_process').spawn,
      getFreePort: async () => 9090,
      findBinary: async () => ({ binary: '/bin/nexus', isNpxFallback: false }),
      logger: createMockLogger(),
      readyIntervalMs: 10,
      nodeVersion: '24.0.0',
    });

    await vi.advanceTimersByTimeAsync(100);
    await resultPromise;

    expect(fs.open).toHaveBeenCalledWith('/var/log/nexus.log', 'a');
    expect(spawn).toHaveBeenCalledWith(
      '/bin/nexus',
      ['--port', '9090', '--project-root', repoRoot],
      expect.objectContaining({
        detached: true,
        stdio: ['ignore', 10, 10],
      }),
    );
  });

  test('NEXUS_LOG_FILE のオープンに失敗しても ignore でフォールバックし警告する', async () => {
    const fs = createMockFs();
    (fs.open as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('EACCES'));
    const logger = createMockLogger();
    const child = createMockChildProcess({ pid: 54321 });
    const spawn = vi.fn(() => child);
    const resultPromise = ensureDaemon({
      repoRoot,
      env: { NEXUS_LOG_FILE: '/var/log/nexus.log' },
      fs,
      fetch: createMockFetch([{ ok: true, status: 200, statusText: 'OK', text: async () => '' }]),
      spawn: spawn as unknown as typeof import('node:child_process').spawn,
      getFreePort: async () => 9090,
      findBinary: async () => ({ binary: '/bin/nexus', isNpxFallback: false }),
      logger,
      readyIntervalMs: 10,
      nodeVersion: '24.0.0',
    });

    await vi.advanceTimersByTimeAsync(100);
    await resultPromise;

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('NEXUS_LOG_FILE'));
    expect(spawn).toHaveBeenCalledWith(
      '/bin/nexus',
      ['--port', '9090', '--project-root', repoRoot],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
  });
});
