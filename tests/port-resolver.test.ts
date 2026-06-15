import { describe, expect, test } from 'vitest';
import { getFreePort } from '../src/port-resolver.js';
import net from 'node:net';

describe('getFreePort', () => {
  test('有効なポート番号を返す', async () => {
    const port = await getFreePort();
    expect(typeof port).toBe('number');
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });

  test('返されたポートで実際に listen できる', async () => {
    const port = await getFreePort();
    const server = net.createServer();

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    });
  });

  test('複数回呼んでも有効なポートを返す', async () => {
    const ports = await Promise.all([getFreePort(), getFreePort(), getFreePort()]);
    for (const port of ports) {
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThanOrEqual(65535);
    }
  });
});
