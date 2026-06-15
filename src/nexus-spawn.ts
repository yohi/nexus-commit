import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';

export interface BinaryResolution {
  readonly binary: string;
  readonly isNpxFallback: boolean;
}

export interface ResolveNexusBinaryInputs {
  readonly envBin?: string;
  readonly localBin?: string;
  readonly pathBin?: string;
}

export function resolveNexusBinary(inputs: ResolveNexusBinaryInputs): string {
  return inputs.envBin ?? inputs.localBin ?? inputs.pathBin ?? 'npx @yohi/nexus';
}

export function lookupPathBinary(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    execFile(isWindows ? 'where' : 'which', [cmd], (error, stdout) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      const line = stdout.split(/\r?\n/)[0]?.trim();
      if (!line) {
        reject(new Error(`Binary not found: ${cmd}`));
        return;
      }
      resolve(line);
    });
  });
}

export async function findNexusBinary(
  env: NodeJS.ProcessEnv,
  cwd: string,
  lookupPath: (cmd: string) => Promise<string> = lookupPathBinary,
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  exists: (path: string) => boolean = (path) => existsSync(path),
): Promise<BinaryResolution> {
  const envBin = env.NEXUS_BIN;
  if (envBin) {
    return { binary: envBin, isNpxFallback: false };
  }

  const localBin = join(cwd, 'node_modules/.bin/nexus');
  if (exists(localBin)) {
    return { binary: localBin, isNpxFallback: false };
  }

  try {
    const pathBin = await lookupPath('nexus');
    return { binary: pathBin, isNpxFallback: false };
  } catch {
    return { binary: 'npx @yohi/nexus', isNpxFallback: true };
  }
}
