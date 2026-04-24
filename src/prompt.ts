import type { Lang, NexusResult } from './types.js';

export interface PromptInput {
  diff: string;
  contexts: NexusResult[];
  files: string[];
  lang: Lang;
  hint?: string;
}

export interface PromptOutput {
  system: string;
  user: string;
}

const CC_TYPES = 'feat / fix / docs / style / refactor / perf / test / build / ci / chore / revert';
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function buildSystem(lang: Lang): string {
  const langClause = lang === 'ja' ? '日本語で' : 'in English';
  return [
    'あなたは熟練ソフトウェアエンジニアです。',
    '以下の git diff と関連コンテキストを読み、Conventional Commits v1.0.0 に厳格に準拠した',
    `コミットメッセージを1件だけ、${langClause}生成してください。`,
    '',
    'ルール:',
    `- type は ${CC_TYPES} のいずれか`,
    '- scope は変更対象の主要なモジュール名・パッケージ名。不要なら省略',
    '- description は命令形で簡潔に',
    '- 本文が必要なら空行を1行挟んで記述',
    '- 破壊的変更は BREAKING CHANGE: フッターを付与',
    '- メッセージ以外のテキスト・コードブロック記号・説明は絶対に出力しない',
  ].join('\n');
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function buildUser(input: PromptInput): string {
  const parts: string[] = [];

  parts.push('# 変更ファイル');
  if (input.files.length === 0) {
    parts.push('(なし)');
  } else {
    parts.push(input.files.map((file) => `- ${file}`).join('\n'));
  }

  if (input.contexts.length > 0) {
    parts.push('');
    parts.push('# 関連コンテキスト');
    for (const ctx of input.contexts) {
      parts.push('---');
      parts.push(`file: ${ctx.file}`);
      parts.push('content:');
      parts.push(normalizeContent(ctx.content));
      parts.push('---');
    }
  }

  const cleanedDiff = input.diff.replace(ANSI_RE, '');
  const maxTicks = Math.max(...[...cleanedDiff.matchAll(/`+/g)].map((m) => m[0].length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  parts.push('');
  parts.push('# Diff');
  parts.push(`${fence}diff`);
  parts.push(cleanedDiff);
  parts.push(fence);

  if (input.hint) {
    parts.push('');
    parts.push('# 追加の指示');
    parts.push(input.hint);
  }

  return parts.join('\n');
}

export function build(input: PromptInput): PromptOutput {
  return {
    system: buildSystem(input.lang),
    user: buildUser(input),
  };
}
