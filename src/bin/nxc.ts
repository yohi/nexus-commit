#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import * as clack from '@clack/prompts';
import { getFlagWarnings, parseFlags, type Flags } from '../flags.js';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import { NodeGitClient, NoopGitClient, getRepoRoot } from '../git.js';
import { HttpNexusClient } from '../nexus-client.js';
import { OpenAICompatibleLlmClient } from '../llm.js';
import { extract as extractKeywords } from '../keywords.js';
import { build as buildTruncated } from '../truncate.js';
import { build as buildPrompt } from '../prompt.js';
import { loadPromptFile } from '../prompt-file.js';
import { countTokens, PROMPT_SUFFIX_MAX_TOKENS, truncateToTokens } from '../tokenizer.js';
import type { Config, GitClient, LlmClientPort, NexusClientPort, NexusResult } from '../types.js';
import type { EnsureDaemonOptions } from '../nexus-daemon.js';
import { ensureDaemon } from '../nexus-daemon.js';
import pkg from '../../package.json' with { type: 'json' };

const HELP_TEXT = `Usage: nxc [options]

Generate a Conventional Commits message from git diff using a local LLM
and Nexus context.

Options:
  --staged       Target staged diff (default)
  --unstaged     Target unstaged diff
  --all          Target both staged + unstaged
  --doctor       Run doctor mode checks
  --auto-start-nexus  Automatically start a local Nexus daemon if needed
  --json         Output in JSON format (works with --doctor)
  --lang <ja|en> Output language (default: ja)
  --model <name> Override LLM model name
  --dry-run      Print message to stdout without committing
  --non-interactive  Skip interactive prompts (best with --dry-run)
  --no-context   Skip Nexus context lookup
  -h, --help     Show this help
  -v, --version  Show version
`;

function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

interface Deps {
  git: GitClient;
  nexus: NexusClientPort;
  llm: LlmClientPort;
  ensureDaemon?: (options: EnsureDaemonOptions) => Promise<{ port: number }>;
  getRepoRoot?: () => Promise<string>;
}

function createDeps(
  config: Config,
  overrides?: Partial<Deps>,
  options: { skipGit?: boolean; nexusUrl?: string } = {},
): Deps {
  const nexusUrl = options.nexusUrl ?? config.nexusUrl;
  return {
    git: options.skipGit
      ? (overrides?.git ?? new NoopGitClient())
      : (overrides?.git ?? new NodeGitClient()),
    nexus: overrides?.nexus ?? new HttpNexusClient(nexusUrl),
    llm: overrides?.llm ?? new OpenAICompatibleLlmClient(config.llmUrl, config.llmApiKey),
  };
}

function isCi(): boolean {
  return process.env.CI === 'true' || process.env.CI === '1';
}

async function tryAutoStartNexus(config: Config, overrides?: Partial<Deps>): Promise<string> {
  if (process.env.NEXUS_API_URL) {
    return config.nexusUrl;
  }
  if (!config.autoStartNexus) {
    return config.nexusUrl;
  }
  if (config.nonInteractive || isCi()) {
    logger.warn(
      '--auto-start-nexus は対話モードでのみ有効です。CI/非対話環境では既存の Nexus サーバーに接続します。',
    );
    return config.nexusUrl;
  }

  try {
    const repoRoot = await (overrides?.getRepoRoot ?? getRepoRoot)();
    const { port } = await (overrides?.ensureDaemon ?? ensureDaemon)({
      repoRoot,
      env: process.env,
      nodeVersion: process.versions.node,
    });
    return `http://127.0.0.1:${port}`;
  } catch (err) {
    logger.warn(`Nexus daemon の自動起動に失敗しました: ${errorToString(err)}`);
    logger.warn('   既存の Nexus サーバーまたはコンテキストなしで続行します。');
    return config.nexusUrl;
  }
}

async function generate(
  config: Config,
  deps: Deps,
  diff: string,
  files: string[],
  hint: string | undefined,
  customSuffix: string | undefined,
  cachedContexts?: NexusResult[],
): Promise<{ message: string; contexts: NexusResult[] }> {
  const keywords = extractKeywords(diff);
  let contexts: NexusResult[] = cachedContexts ?? [];

  if (config.useContext && !cachedContexts) {
    try {
      const query = [...keywords, ...files].join(' ');
      contexts = await deps.nexus.search({ query, files }, { timeoutMs: config.nexusTimeoutMs });
    } catch (err) {
      logger.warn(`Nexus サーバーに接続できませんでした (${config.nexusUrl})`);
      logger.dim(`   ${errorToString(err)}`);
      if (!config.nonInteractive) {
        logger.warn('   コンテキストなしで続行します。');
      }
    }
  }

  const truncated = buildTruncated({
    diff,
    contexts,
    maxTokens: config.maxTokens,
  });

  const { system, user } = buildPrompt({
    diff: truncated.diff,
    contexts: truncated.contexts,
    files,
    lang: config.lang,
    hint,
    customSuffix,
  });

  let spinner: { start: (m: string) => void; stop: (m: string) => void } | undefined;
  if (!config.nonInteractive) {
    spinner = clack.spinner();
    spinner.start('LLM でコミットメッセージ生成中...');
  }

  try {
    const result = await deps.llm.chat(
      { system, user, model: config.llmModel },
      { timeoutMs: config.llmTimeoutMs },
    );
    spinner?.stop('生成完了');

    return { message: cleanupGeneratedMessage(result), contexts };
  } catch (err) {
    spinner?.stop('生成失敗');
    logger.error(`ローカル LLM に接続できません: ${errorToString(err)}`);
    throw Object.assign(new Error('llm-failed'), { exitCode: 3 });
  }
}

export function cleanupGeneratedMessage(result: string): string {
  let message = result.trim();

  // Remove common LLM chatter prefixes
  message = message.replace(/^(Here is|This is|The commit message is|Generated message):?\s*/i, '');

  // Handle triple backticks
  if (message.startsWith('```') && message.endsWith('```')) {
    const lines = message.split('\n');
    if (lines.length >= 2) {
      message = lines.slice(1, -1).join('\n').trim();
    } else {
      message = message.slice(3, -3).trim();
    }
  } else {
    message = message.replace(/^```(?:[a-z]*)\n/, '').replace(/\n```$/, '');
  }

  // Remove Markdown headers (# Header) that sometimes leak
  message = message
    .split('\n')
    .filter((line) => !/^#+\s/.test(line.trim()))
    .join('\n')
    .trim();

  return message;
}

async function interactive(
  config: Config,
  deps: Deps,
  diff: string,
  files: string[],
  customSuffix: string | undefined,
): Promise<number> {
  clack.intro('nxc — Nexus Commit');
  let hint: string | undefined;
  let message: string;
  let contexts: NexusResult[] | undefined;

  try {
    const res = await generate(config, deps, diff, files, hint, customSuffix);
    message = res.message;
    contexts = res.contexts;
  } catch (err) {
    clack.cancel('生成に失敗しました');
    throw err;
  }

  for (;;) {
    clack.note(message, '生成されたコミットメッセージ');
    const action = await clack.select({
      message: 'どうしますか？',
      options: [
        {
          value: 'commit',
          label: config.dryRun ? '採用して出力' : '採用してコミット',
        },
        {
          value: 'edit',
          label: config.dryRun ? '編集してから出力' : '編集してからコミット',
        },
        { value: 'regen', label: '再生成（追加指示）' },
        { value: 'abort', label: '中止' },
      ],
    });

    if (clack.isCancel(action) || action === 'abort') {
      clack.cancel('中止しました');
      return 0;
    }

    if (action === 'edit') {
      const edited = await clack.text({
        message: 'メッセージを編集してください',
        initialValue: message,
        validate: (value) => {
          if (!value.trim()) return 'メッセージを入力してください';
          return;
        },
      });
      if (clack.isCancel(edited)) {
        clack.cancel('中止しました');
        return 0;
      }
      message = edited.trim();
    }

    if (action === 'regen') {
      const newHint = await clack.text({
        message: '追加の指示（例: もっと簡潔に）',
        placeholder: '（なしでも可）',
        defaultValue: '',
      });
      if (clack.isCancel(newHint)) {
        clack.cancel('中止しました');
        return 0;
      }
      hint = newHint || undefined;
      try {
        const res = await generate(config, deps, diff, files, hint, customSuffix, contexts);
        message = res.message;
        contexts = res.contexts;
      } catch (err) {
        clack.cancel('再生成に失敗しました');
        throw err;
      }
      continue;
    }

    if (!message.trim()) {
      clack.log.error('コミットメッセージが空です');
      continue;
    }

    if (config.dryRun) {
      process.stdout.write(`${message}\n`);
      clack.outro('--dry-run: コミットをスキップしました');
      return 0;
    }

    try {
      await deps.git.commit(message);
    } catch (err) {
      clack.cancel(`コミット失敗: ${errorToString(err)}`);
      return 1;
    }
    clack.outro('コミットしました');
    return 0;
  }
}

export async function main(argv: string[], overrides?: Partial<Deps>): Promise<number> {
  let flags: Flags;
  try {
    flags = parseFlags(argv);
  } catch (err) {
    logger.error(errorToString(err));
    return 2;
  }

  for (const warning of getFlagWarnings(flags)) {
    logger.warn(warning);
  }

  if (flags.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  if (flags.version) {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  let config: Config;
  try {
    config = loadConfig(process.env, flags);
  } catch (err) {
    logger.error(errorToString(err));
    return 2;
  }

  if (flags.doctor) {
    const deps = createDeps(config, overrides, { skipGit: true });
    const { runDoctor, renderReport } = await import('../doctor.js');
    const report = await runDoctor(config, {
      nexus: deps.nexus,
      llm: deps.llm,
    });
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(renderReport(report));
    }
    return report.exitCode;
  }

  let customSuffix: string | undefined;
  try {
    const result = await loadPromptFile();
    if (result.content !== null) {
      const tokens = countTokens(result.content);
      if (tokens > PROMPT_SUFFIX_MAX_TOKENS) {
        logger.warn(
          `カスタムプロンプト (.github/nxc.prompt.md) が ${PROMPT_SUFFIX_MAX_TOKENS} ` +
            `トークン上限を超過 (実測 ${tokens} tokens)。末尾を切り詰めます。`,
        );
        customSuffix = truncateToTokens(result.content, PROMPT_SUFFIX_MAX_TOKENS);
      } else {
        customSuffix = result.content;
      }
    }
  } catch (err) {
    logger.warn(`カスタムプロンプトファイルの読み込みに失敗: ${errorToString(err)}`);
    logger.warn('   デフォルトプロンプトで続行します。');
  }

  const nexusUrl = await tryAutoStartNexus(config, overrides);
  const deps = createDeps(config, overrides, { nexusUrl });
  try {
    if (!(await deps.git.isRepo())) {
      logger.error('Not a git repository');
      return 2;
    }

    const { diff, files } = await deps.git.getDiff(config.diffMode);
    if (!diff.trim()) {
      logger.info('変更がありません');
      return 0;
    }

    if (config.nonInteractive) {
      const { message } = await generate(config, deps, diff, files, undefined, customSuffix);
      if (config.dryRun) {
        process.stdout.write(`${message}\n`);
      } else {
        await deps.git.commit(message);
      }
      return 0;
    }

    return await interactive(config, deps, diff, files, customSuffix);
  } catch (err) {
    const exitCode = (err as { exitCode?: number }).exitCode;
    if (exitCode !== undefined) {
      return exitCode;
    }
    logger.error(errorToString(err));
    return 1;
  }
}

let _isMain = false;
try {
  _isMain = !!(process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url));
} catch {
  // realpathSync can throw ENOENT if the path no longer exists
}

if (_isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      logger.error(errorToString(err));
      process.exit(1);
    },
  );
}
