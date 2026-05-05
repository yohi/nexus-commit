import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  dim: vi.fn(),
};

vi.mock('../../src/logger.js', () => ({ logger }));

describe('nxc main json warning', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('--json を --doctor なしで指定した場合は警告する', async () => {
    const { main } = await import('../../src/bin/nxc.js');

    const code = await main(['--json', '--help']);

    expect(code).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      '--json は --doctor と一緒に使うときのみ有効です。通常フローを続行します。',
    );
  });
});
