#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import * as clack from '@clack/prompts';
import { parseFlags, type Flags } from '../flags.js';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import { NodeGitClient } from '../git.js';
import { HttpNexusClient } from '../nexus-client.js';
import { OpenAICompatibleLlmClient } from '../llm.js';
import { extract as extractKeywords } from '../keywords.js';
import { build as buildTruncated } from '../truncate.js';
import { build as buildPrompt } from '../prompt.js';
import type {
  Config,
  GitClient,
  LlmClientPort,
  NexusClientPort,
  NexusResult,
} from '../types.js';
import pkg from '../../package.json' with { type: 'json' };

const HELP_TEXT = `Usage: nxc [options]

Generate a Conventional Commits message from git diff using a local LLM
and Nexus context.

Options:
  --staged       Target staged diff (default)
  --unstaged     Target unstaged diff
  --all          Target both staged + unstaged
  --lang <ja|en> Output language (default: ja)
  --model <name> Override LLM model name
  --dry-run      Print message to stdout without committing
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
}

async function generate(
  config: Config,
  deps: Deps,
  diff: string,
  files: string[],
  hint: string | undefined,
): Promise<string> {
  const keywords = extractKeywords(diff);
  let contexts: NexusResult[] = [];

  if (config.useContext) {
    try {
      const query = [...keywords, ...files].join(' ');
      contexts = await deps.nexus.search(
        { query, files },
        { timeoutMs: config.nexusTimeoutMs },
      );
    } catch (err) {
      logger.warn(`Nexus サーバーに接続できませんでした (${config.nexusUrl})`);
      logger.dim(`   ${errorToString(err)}`);
      logger.warn('   コンテキストなしで続行します。');
    }
  }

  const truncated = buildTruncated({
    diff,
    contexts,
    maxChars: config.maxChars,
  });

  const { system, user } = buildPrompt({
    diff: truncated.diff,
    contexts: truncated.contexts,
    files,
    lang: config.lang,
    hint,
  });

  const spinner = clack.spinner();
  spinner.start('LLM でコミットメッセージ生成中...');
  try {
    const result = await deps.llm.chat(
      { system, user, model: config.llmModel },
      { timeoutMs: config.llmTimeoutMs },
    );
    spinner.stop('生成完了');
    return result.trim();
  } catch (err) {
    spinner.stop('生成失敗');
    logger.error(`ローカル LLM に接続できません: ${errorToString(err)}`);
    throw Object.assign(new Error('llm-failed'), { exitCode: 3 });
  }
}

async function interactive(
  config: Config,
  deps: Deps,
  diff: string,
  files: string[],
): Promise<number> {
  clack.intro('nxc — Nexus Commit');
  let hint: string | undefined;
  let message = await generate(config, deps, diff, files, hint);

  for (;;) {
    clack.note(message, '生成されたコミットメッセージ');
    const action = await clack.select({
      message: 'どうしますか？',
      options: [
        { value: 'commit', label: '採用してコミット' },
        { value: 'edit', label: '編集してからコミット' },
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
      });
      if (clack.isCancel(edited)) {
        clack.cancel('中止しました');
        return 0;
      }
      message = edited;
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
      message = await generate(config, deps, diff, files, hint);
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

export async function main(argv: string[]): Promise<number> {
  let flags: Flags;
  try {
    flags = parseFlags(argv);
  } catch (err) {
    logger.error(errorToString(err));
    return 2;
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

  const deps: Deps = {
    git: new NodeGitClient(),
    nexus: new HttpNexusClient(config.nexusUrl),
    llm: new OpenAICompatibleLlmClient(config.llmUrl, config.llmApiKey),
  };

  if (!(await deps.git.isRepo())) {
    logger.error('Not a git repository');
    return 2;
  }

  const { diff, files } = await deps.git.getDiff(config.diffMode);
  if (!diff.trim()) {
    logger.info('変更がありません');
    return 0;
  }

  try {
    return await interactive(config, deps, diff, files);
  } catch (err) {
    const code = (err as { exitCode?: number }).exitCode ?? 1;
    return code;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      logger.error(errorToString(err));
      process.exit(1);
    },
  );
}
