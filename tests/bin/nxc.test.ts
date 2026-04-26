import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main } from '../../src/bin/nxc.js';
import pkg from '../../package.json' with { type: 'json' };
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('main', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('should have HELP_TEXT synchronized with README.md', async () => {
    const readmePath = path.resolve(__dirname, '../../README.md');
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    
    // Extract CLI Options from README using markers
    const match = readmeContent.match(/<!-- CLI_OPTIONS_START -->\n```bash\n([\s\S]*?)\n```\n<!-- CLI_OPTIONS_END -->/);
    const readmeOptions = match?.[1]?.trim();
    if (readmeOptions === undefined) {
      throw new Error('Could not find CLI options markers or content in README.md');
    }

    // Import HELP_TEXT from src/bin/nxc.ts (via main or exported directly if possible)
    // For now, we compare against what main(['--help']) outputs
    let capturedOutput = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((content) => {
      capturedOutput += content;
      return true;
    });

    await main(['--help']);
    expect(capturedOutput.trim()).toBe(readmeOptions);
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
    vi.stubEnv('NEXUS_API_URL', 'http://localhost:3000');
    vi.stubEnv('NEXUS_COMMIT_LLM_URL', 'http://localhost:11434');
    
    const code = await main(['--staged']);
    expect(code).toBe(0);
  });
});
