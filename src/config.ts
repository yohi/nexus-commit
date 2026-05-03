import { ALLOWED_LANGS, type Config, type Lang } from './types.js';
import { isLang, type Flags } from './flags.js';

function parsePositiveInt(raw: string | undefined, fallback: number, label: string): number {
  if (raw === undefined) {
    return fallback;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid ${label}: ${raw}`);
  }

  const n = Number(raw);
  if (n <= 0 || !Number.isSafeInteger(n)) {
    throw new Error(`Invalid ${label}: ${raw}`);
  }

  return n;
}

function parseLang(raw: string | undefined, fallback: Lang): Lang {
  if (raw === undefined) {
    return fallback;
  }

  if (!isLang(raw)) {
    throw new Error(`Invalid lang: ${raw} (allowed: ${ALLOWED_LANGS.join(', ')})`);
  }

  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv, flags: Flags): Config {
  const lang = flags.lang ?? parseLang(env.NEXUS_COMMIT_LANG, 'ja');
  const maxTokens = parsePositiveInt(env.NEXUS_COMMIT_MAX_TOKENS, 8192, 'maxTokens');
  const nexusTimeoutMs = parsePositiveInt(
    env.NEXUS_COMMIT_NEXUS_TIMEOUT_MS,
    5000,
    'nexusTimeoutMs',
  );
  const llmTimeoutMs = parsePositiveInt(env.NEXUS_COMMIT_LLM_TIMEOUT_MS, 60000, 'llmTimeoutMs');

  if (env.NEXUS_COMMIT_MAX_CHARS !== undefined) {
    process.stderr.write(
      '[nxc] 警告: NEXUS_COMMIT_MAX_CHARS は廃止されました。設定値は無視され、デフォルト値が使用されます。 NEXUS_COMMIT_MAX_TOKENS を使用してください。\n',
    );
  }

  return {
    nexusUrl: env.NEXUS_API_URL ?? 'http://localhost:8080',
    llmUrl: env.NEXUS_COMMIT_LLM_URL ?? 'http://localhost:11434/v1',
    llmModel: flags.model ?? env.NEXUS_COMMIT_LLM_MODEL ?? 'qwen2.5-coder:7b',
    llmApiKey: env.NEXUS_COMMIT_LLM_API_KEY ?? 'ollama',
    lang,
    maxTokens,
    nexusTimeoutMs,
    llmTimeoutMs,
    diffMode: flags.diffMode,
    dryRun: flags.dryRun,
    useContext: flags.useContext,
  };
}
