#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { parseFlags, type Flags } from '../flags.js';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import type { Config } from '../types.js';
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

  logger.info(`(skeleton) mode=${config.diffMode} lang=${config.lang} dryRun=${config.dryRun}`);
  return 0;
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
