import { describe, it, expect, vi, beforeEach } from 'vitest';
import { main } from '../../src/bin/nxc.js';
import pkg from '../../package.json' with { type: 'json' };

describe('main', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('should show help text when --help is specified', async () => {
    const code = await main(['--help']);
    expect(code).toBe(0);
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('Usage: nxc'));
  });

  it('should show version when --version is specified', async () => {
    const code = await main(['--version']);
    expect(code).toBe(0);
    expect(process.stdout.write).toHaveBeenCalledWith(`${pkg.version}\n`);
  });

  it('should return exit code 2 on unknown flag', async () => {
    const code = await main(['--unknown']);
    expect(code).toBe(2);
  });

  it('should return exit code 0 on valid flags (skeleton mode)', async () => {
    // env vars for loadConfig
    process.env.NEXUS_URL = 'http://localhost:3000';
    process.env.LLM_URL = 'http://localhost:11434';
    
    const code = await main(['--staged']);
    expect(code).toBe(0);
  });
});
