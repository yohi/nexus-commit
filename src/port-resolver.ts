import net from 'node:net';

/**
 * OS に空きポートを問い合わせて返す。
 * listen(0) で ephemeral port を割り当て、address() を取得後に即座に close する。
 * 取得後〜nexus 起動前に別プロセスが同じポートを奪う TOCTOU リスクがあるため、
 * spawn 失敗時は別ポートを再採番してリトライする必要がある。
 */
export function getFreePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, host, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to retrieve ephemeral port')));
        return;
      }
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(address.port);
      });
    });
    server.once('error', reject);
  });
}
