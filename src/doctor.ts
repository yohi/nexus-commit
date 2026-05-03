import { version as nodeVersion } from 'node:process';
import pc from 'picocolors';
import { findPromptFile } from './prompt-file.js';
import type { Config, NexusClientPort, LlmClientPort } from './types.js';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface CheckResult {
  readonly title: string;
  readonly status: CheckStatus;
  readonly detail?: string;
  readonly hint?: string;
}

export interface DoctorDeps {
  readonly nexus: NexusClientPort;
  readonly llm: LlmClientPort;
  readonly cwd?: string;
}

export interface DoctorReport {
  readonly results: readonly CheckResult[];
  readonly exitCode: 0 | 4;
}

export async function runDoctor(config: Config, deps: DoctorDeps): Promise<DoctorReport> {
  const results: CheckResult[] = [];

  // 1. Node.js version
  const majorStr = nodeVersion.startsWith('v') ? nodeVersion.slice(1) : nodeVersion;
  const major = parseInt(majorStr.split('.')[0] || '0', 10);
  results.push({
    title: 'Node.js version',
    status: major >= 22 ? 'ok' : 'fail',
    detail: nodeVersion,
    hint: major < 22 ? 'Node.js 22+ is required. Please upgrade.' : undefined,
  });

  // 2. Configuration
  results.push({
    title: 'Configuration',
    status: 'ok',
    detail: `llmUrl=${config.llmUrl}, model=${config.llmModel}, lang=${config.lang}, maxTokens=${config.maxTokens}, apiKey=***`,
  });

  // 3. Nexus API reachable
  try {
    if (config.useContext) {
      const start = Date.now();
      // Nexus API への疎通確認（空検索）
      await deps.nexus.search({ query: '', files: [] }, { timeoutMs: 3000 });
      const elapsed = Date.now() - start;
      results.push({
        title: 'Nexus API reachable',
        status: 'ok',
        detail: `${config.nexusUrl} (responded in ${elapsed}ms)`,
      });
    } else {
      results.push({
        title: 'Nexus API reachable',
        status: 'skip',
        detail: 'Skipped (--no-context)',
      });
    }
  } catch (err) {
    results.push({
      title: 'Nexus API reachable',
      status: 'fail',
      detail: config.nexusUrl,
      hint: `Nexus API not reachable. Is the server running? (${err instanceof Error ? err.message : String(err)})`,
    });
  }

  // 4. LLM endpoint reachable
  let models: string[] = [];
  let llmReachable = false;
  try {
    models = await deps.llm.listModels({ timeoutMs: 3000 });
    results.push({
      title: 'LLM endpoint reachable',
      status: 'ok',
      detail: config.llmUrl,
    });
    llmReachable = true;
  } catch (err) {
    results.push({
      title: 'LLM endpoint reachable',
      status: 'fail',
      detail: config.llmUrl,
      hint: `LLM endpoint not reachable. Ensure your LLM server is running. (${err instanceof Error ? err.message : String(err)})`,
    });
  }

  // 5. Model existence
  if (llmReachable) {
    const found = models.includes(config.llmModel);
    results.push({
      title: `Model '${config.llmModel}' found`,
      status: found ? 'ok' : 'fail',
      detail: found ? undefined : `Available: ${models.join(', ')}`,
      hint: found ? undefined : `Run \`ollama pull ${config.llmModel}\` or check your model name.`,
    });
  }

  // 6. Custom prompt file
  try {
    const promptPath = await findPromptFile(deps.cwd ?? process.cwd());
    if (promptPath === null) {
      results.push({
        title: 'Custom prompt file',
        status: 'skip',
        detail: 'no .github/nxc.prompt.md (or empty)',
      });
    } else {
      results.push({
        title: 'Custom prompt file',
        status: 'ok',
        detail: promptPath,
      });
    }
  } catch (err) {
    results.push({
      title: 'Custom prompt file',
      status: 'warn',
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const hasFail = results.some((r) => r.status === 'fail');
  return {
    results,
    exitCode: hasFail ? 4 : 0,
  };
}

export function renderReport(report: DoctorReport): string {
  let out = `\n${pc.bold('nxc doctor')}\n\n`;

  for (const res of report.results) {
    const icon =
      res.status === 'ok'
        ? pc.green('✓')
        : res.status === 'fail'
          ? pc.red('✗')
          : res.status === 'warn'
            ? pc.yellow('!')
            : pc.dim('⊘');

    out += `  ${icon} ${res.title.padEnd(25)} ${res.detail || ''}\n`;
    if (res.hint) {
      out += `       ${pc.dim(`Hint: ${res.hint}`)}\n`;
    }
  }

  const okCount = report.results.filter((r) => r.status === 'ok').length;
  const failCount = report.results.filter((r) => r.status === 'fail').length;
  const skipCount = report.results.filter((r) => r.status === 'skip').length;
  const warnCount = report.results.filter((r) => r.status === 'warn').length;

  out += `\n${pc.bold('Result:')} ${failCount} failed, ${okCount} ok, ${skipCount} skipped, ${warnCount} warned (total ${report.results.length})\n`;
  out += `${pc.bold('Exit:')} ${report.exitCode}\n`;

  return out;
}
