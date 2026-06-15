import { describe, expect, test, vi } from 'vitest';
import { findNexusBinary, resolveNexusBinary } from '../src/nexus-spawn.js';

describe('resolveNexusBinary', () => {
  test('NEXUS_BIN が最優先', () => {
    expect(
      resolveNexusBinary({
        envBin: '/custom/nexus',
        localBin: '/cwd/node_modules/.bin/nexus',
        pathBin: '/usr/local/bin/nexus',
      }),
    ).toBe('/custom/nexus');
  });

  test('local node_modules が第2優先', () => {
    expect(
      resolveNexusBinary({
        localBin: '/cwd/node_modules/.bin/nexus',
        pathBin: '/usr/local/bin/nexus',
      }),
    ).toBe('/cwd/node_modules/.bin/nexus');
  });

  test('PATH 上の nexus が第3優先', () => {
    expect(resolveNexusBinary({ pathBin: '/usr/local/bin/nexus' })).toBe('/usr/local/bin/nexus');
  });

  test('見つからない場合は npx フォールバック', () => {
    expect(resolveNexusBinary({})).toBe('npx @yohi/nexus');
  });
});

describe('findNexusBinary', () => {
  test('NEXUS_BIN 環境変数があればそれを返す', async () => {
    const result = await findNexusBinary(
      { NEXUS_BIN: '/env/nexus' },
      '/repo',
      async () => '/path/nexus',
      () => true,
    );
    expect(result.binary).toBe('/env/nexus');
    expect(result.isNpxFallback).toBe(false);
  });

  test('node_modules/.bin/nexus が存在すればそれを返す', async () => {
    const result = await findNexusBinary(
      {},
      '/repo',
      async () => '/path/nexus',
      (path) => path === '/repo/node_modules/.bin/nexus',
    );
    expect(result.binary).toBe('/repo/node_modules/.bin/nexus');
    expect(result.isNpxFallback).toBe(false);
  });

  test('PATH 上に nexus があればそれを返す', async () => {
    const result = await findNexusBinary(
      {},
      '/repo',
      async () => '/usr/local/bin/nexus',
      () => false,
    );
    expect(result.binary).toBe('/usr/local/bin/nexus');
    expect(result.isNpxFallback).toBe(false);
  });

  test('どれもない場合は npx フォールバック', async () => {
    const result = await findNexusBinary(
      {},
      '/repo',
      async () => {
        throw new Error('not found');
      },
      () => false,
    );
    expect(result.binary).toBe('npx');
    expect(result.argsPrefix).toEqual(['@yohi/nexus']);
    expect(result.isNpxFallback).toBe(true);
  });

  test('PATH 検索に失敗しても npx フォールバックする', async () => {
    const lookup = vi.fn().mockRejectedValue(new Error('not found'));
    const result = await findNexusBinary({}, '/repo', lookup, () => false);
    expect(result.binary).toBe('npx');
    expect(result.argsPrefix).toEqual(['@yohi/nexus']);
    expect(result.isNpxFallback).toBe(true);
  });
});
