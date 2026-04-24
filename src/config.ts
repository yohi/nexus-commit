import type { Config, Lang } from './types.js';
import type { Flags } from './flags.js';

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) {
    return fallback;
  }

  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) {
    if (name === 'maxChars') {
      throw new Error(`Invalid maxChars: ${raw}`);
    }
    throw new Error(`Invalid timeout for ${name}: ${raw}`);
  }

  return n;
}

function parseLang(raw: string | undefined, fallback: Lang): Lang {
  if (raw === undefined) {
    return fallback;
  }

  if (raw !== 'ja' && raw !== 'en') {
    throw new Error(`Invalid lang: ${raw} (allowed: ja, en)`);
  }

  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv, flags: Flags): Config {
  const lang = flags.lang ?? parseLang(env.NEXUS_COMMIT_LANG, 'ja');
  const maxChars = parsePositiveInt(env.NEXUS_COMMIT_MAX_CHARS, 24000, 'maxChars');
  const nexusTimeoutMs = parsePositiveInt(
    env.NEXUS_COMMIT_NEXUS_TIMEOUT_MS,
    5000,
    'nexusTimeoutMs',
  );
  const llmTimeoutMs = parsePositiveInt(env.NEXUS_COMMIT_LLM_TIMEOUT_MS, 60000, 'llmTimeoutMs');

  return {
    nexusUrl: env.NEXUS_API_URL ?? 'http://localhost:8080',
    llmUrl: env.NEXUS_COMMIT_LLM_URL ?? 'http://localhost:11434/v1',
    llmModel: flags.model ?? env.NEXUS_COMMIT_LLM_MODEL ?? 'qwen2.5-coder:7b',
    llmApiKey: env.NEXUS_COMMIT_LLM_API_KEY ?? 'ollama',
    lang,
    maxChars,
    nexusTimeoutMs,
    llmTimeoutMs,
    diffMode: flags.diffMode,
    dryRun: flags.dryRun,
    useContext: flags.useContext,
  };
}
