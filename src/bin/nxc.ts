#!/usr/bin/env node
import { parseFlags } from '../flags.js';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';

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

const VERSION = '0.1.0';

export async function main(argv: string[]): Promise<number> {
  let flags;
  try {
    flags = parseFlags(argv);
  } catch (err) {
    logger.error((err as Error).message);
    return 2;
  }

  if (flags.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  let config;
  try {
    config = loadConfig(process.env, flags);
  } catch (err) {
    logger.error((err as Error).message);
    return 2;
  }

  logger.info(`(skeleton) mode=${config.diffMode} lang=${config.lang} dryRun=${config.dryRun}`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    logger.error((err as Error).message);
    process.exit(1);
  },
);
