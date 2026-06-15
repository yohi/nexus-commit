import { version as nodeVersion } from 'node:process';
import pc from 'picocolors';
import { findPromptFile } from './prompt-file.js';
import type { Config, NexusClientPort, LlmClientPort } from './types.js';
import { findNexusBinary, type BinaryResolution } from './nexus-spawn.js';
import { getDaemonStatePath } from './nexus-daemon.js';
import { parseDaemonState } from './daemon-state.js';

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
  readonly findNexusBinary?: (env: NodeJS.ProcessEnv, cwd: string) => Promise<BinaryResolution>;
  readonly readDaemonState?: (
    cwd: string,
    fetchImpl: typeof globalThis.fetch,
  ) => Promise<{ port: number; pid: number } | null>;
  readonly fetch?: typeof globalThis.fetch;
}

export interface DoctorReport {
  readonly results: readonly CheckResult[];
  readonly exitCode: 0 | 4;
}

async function defaultReadDaemonState(
  cwd: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<{ port: number; pid: number } | null> {
  try {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(getDaemonStatePath(cwd), 'utf8');
    const state = parseDaemonState(content);
    if (state === null) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    try {
      await fetchImpl(`http://127.0.0.1:${state.port}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '', files: [] }),
        signal: controller.signal,
      });
      return { port: state.port, pid: state.pid };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

async function checkEmbedModel(
  llmUrl: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<{ found: boolean; detail: string }> {
  const baseUrl = llmUrl.replace(/\/v1$/, '');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      return { found: false, detail: `${baseUrl}/api/tags returned ${response.status}` };
    }
    const data = (await response.json()) as { models?: { name: string }[] };
    const found =
      data.models?.some(
        (m) => m.name === 'nomic-embed-text' || m.name.startsWith('nomic-embed-text:'),
      ) ?? false;
    return {
      found,
      detail: found
        ? 'nomic-embed-text found'
        : `available: ${data.models?.map((m) => m.name).join(', ') ?? 'none'}`,
    };
  } catch (err) {
    return { found: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function runDoctor(config: Config, deps: DoctorDeps): Promise<DoctorReport> {
  const results: CheckResult[] = [];

  // 1. Node.js version
  const majorStr = nodeVersion.startsWith('v') ? nodeVersion.slice(1) : nodeVersion;
  const major = parseInt(majorStr.split('.')[0] || '0', 10);
  const supportsCliRuntime = major >= 22;
  const supportsAutoStart = major >= 24;
  results.push({
    title: 'Node.js version',
    status: supportsCliRuntime && (!config.autoStartNexus || supportsAutoStart) ? 'ok' : 'fail',
    detail: nodeVersion,
    hint: !supportsCliRuntime
      ? 'Node.js 22+ is required. Please upgrade.'
      : config.autoStartNexus && !supportsAutoStart
        ? 'Node.js 24+ is required to auto-start Nexus daemon. Please upgrade.'
        : undefined,
  });

  // 2. Nexus binary resolvable
  try {
    const { binary, isNpxFallback } = await (deps.findNexusBinary ?? findNexusBinary)(
      process.env,
      deps.cwd ?? process.cwd(),
    );
    results.push({
      title: 'Nexus binary',
      status: 'ok',
      detail: `${binary}${isNpxFallback ? ' (npx fallback)' : ''}`,
    });
  } catch (err) {
    results.push({
      title: 'Nexus binary',
      status: 'warn',
      detail: err instanceof Error ? err.message : String(err),
      hint: 'Install nexus globally or set NEXUS_BIN. Auto-start will fall back to npx.',
    });
  }

  // 3. Configuration
  results.push({
    title: 'Configuration',
    status: 'ok',
    detail: `nexusUrl=${config.nexusUrl}, llmUrl=${config.llmUrl}, model=${config.llmModel}, lang=${config.lang}, maxTokens=${config.maxTokens}, apiKey=***`,
  });

  // 4. Nexus API reachable
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
  } catch {
    let defaultPort = '8080';
    if (config.nexusUrl) {
      try {
        defaultPort = new URL(config.nexusUrl).port || '8080';
      } catch {
        console.warn(
          `⚠ Nexus URL の解析に失敗しました (${config.nexusUrl})。ポート 8080 を使用します。`,
        );
      }
    }
    results.push({
      title: 'Nexus API reachable',
      status: 'fail',
      detail: config.nexusUrl,
      hint: `Nexus API not reachable. Start with: nexus --port ${defaultPort}`,
    });
  }

  // 5. LLM endpoint reachable
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

  // 6. Model existence
  if (!llmReachable) {
    results.push({
      title: `Model '${config.llmModel}' found`,
      status: 'skip',
      detail: 'LLM endpoint check failed',
    });
  } else {
    const found = models.includes(config.llmModel);
    results.push({
      title: `Model '${config.llmModel}' found`,
      status: found ? 'ok' : 'fail',
      detail: found ? undefined : `Available: ${models.join(', ')}`,
      hint: found ? undefined : `Run \`ollama pull ${config.llmModel}\` or check your model name.`,
    });
  }

  // 7. Embed model (Ollama)
  const embedCheck = await checkEmbedModel(config.llmUrl, deps.fetch ?? globalThis.fetch);
  if (embedCheck.found) {
    results.push({
      title: 'Embed model (nomic-embed-text)',
      status: 'ok',
      detail: embedCheck.detail,
    });
  } else {
    results.push({
      title: 'Embed model (nomic-embed-text)',
      status: 'warn',
      detail: embedCheck.detail,
      hint: 'Nexus indexing requires `ollama pull nomic-embed-text`.',
    });
  }

  // 8. Daemon status
  const daemonState = await (deps.readDaemonState ?? defaultReadDaemonState)(
    deps.cwd ?? process.cwd(),
    deps.fetch ?? globalThis.fetch,
  );
  if (daemonState) {
    results.push({
      title: 'Nexus daemon status',
      status: 'ok',
      detail: `pid=${daemonState.pid}, port=${daemonState.port}`,
    });
  } else {
    results.push({
      title: 'Nexus daemon status',
      status: 'skip',
      detail: 'no running daemon',
    });
  }

  // 9. Custom prompt file
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
