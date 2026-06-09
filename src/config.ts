import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_LANGS, type Config, type Lang } from './types.js';
import { isLang, type Flags } from './flags.js';

/**
 * Minimal .env loader to support project-specific configurations as promised in README.md.
 * Only loads if .env exists in the current working directory.
 * Existing environment variables are NOT overwritten.
 */
function loadEnvFile(cwd: string): void {
  const envPath = join(cwd, '.env');
  if (!existsSync(envPath)) {
    return;
  }

  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...values] = trimmed.split('=');
      const k = key?.trim();
      if (!k) continue;

      const value = values.join('=').trim();
      if (value && process.env[k] === undefined) {
        process.env[k] = value.replace(/^(["'])(.*?)\1$/, '$2');
      }
    }
  } catch {
    // Silent fail if .env cannot be read
  }
}

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
  loadEnvFile(process.cwd());

  const lang = flags.lang ?? parseLang(env.NEXUS_COMMIT_LANG, 'ja');
  const maxTokens = parsePositiveInt(env.NEXUS_COMMIT_MAX_TOKENS, 8192, 'maxTokens');
  const nexusTimeoutMs = parsePositiveInt(
    env.NEXUS_COMMIT_NEXUS_TIMEOUT_MS,
    5000,
    'nexusTimeoutMs',
  );
  const llmTimeoutMs = parsePositiveInt(env.NEXUS_COMMIT_LLM_TIMEOUT_MS, 60000, 'llmTimeoutMs');
  const llmModel = flags.model ?? env.NEXUS_COMMIT_LLM_MODEL ?? 'qwen2.5-coder:1.5b';

  if (env.NEXUS_COMMIT_MAX_CHARS !== undefined) {
    const message =
      env.NEXUS_COMMIT_MAX_TOKENS !== undefined
        ? '[nxc] 警告: NEXUS_COMMIT_MAX_CHARS は廃止されました。NEXUS_COMMIT_MAX_TOKENS が優先されます。\n'
        : '[nxc] 警告: NEXUS_COMMIT_MAX_CHARS は廃止されました。デフォルト値が使用されます。NEXUS_COMMIT_MAX_TOKENS を設定してください。\n';
    process.stderr.write(message);
  }

  return {
    nexusUrl: env.NEXUS_API_URL ?? 'http://localhost:8080',
    llmUrl: env.NEXUS_COMMIT_LLM_URL ?? 'http://localhost:11434/v1',
    llmModel,
    llmApiKey: env.NEXUS_COMMIT_LLM_API_KEY ?? 'ollama',
    lang,
    maxTokens,
    nexusTimeoutMs,
    llmTimeoutMs,
    diffMode: flags.diffMode,
    dryRun: flags.dryRun,
    nonInteractive: flags.nonInteractive,
    useContext: flags.useContext,
  };
}
