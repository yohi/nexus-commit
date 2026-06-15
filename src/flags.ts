import { ALLOWED_LANGS, type Lang, type DiffMode } from './types.js';

export function isLang(v: string): v is Lang {
  return (ALLOWED_LANGS as readonly string[]).includes(v);
}

export interface Flags {
  diffMode: DiffMode;
  lang?: Lang;
  model?: string;
  dryRun: boolean;
  nonInteractive: boolean;
  useContext: boolean;
  help: boolean;
  version: boolean;
  doctor: boolean;
  json: boolean;
  autoStartNexus: boolean;
}

export function getFlagWarnings(flags: Flags): string[] {
  if (flags.json && !flags.doctor) {
    return ['--json は --doctor と一緒に使うときのみ有効です。通常フローを続行します。'];
  }

  if (flags.nonInteractive && !flags.dryRun) {
    return [
      '--non-interactive: 対話確認をスキップして自動コミットします。出力のみ行いたい場合は --dry-run を併用してください。',
    ];
  }

  return [];
}

function requireNext(argv: string[], i: number, flag: string): string {
  const value = argv[i + 1];
  if (typeof value !== 'string' || value.startsWith('-')) {
    throw new Error(`Flag ${flag} requires a value`);
  }
  return value;
}

export function parseFlags(argv: string[]): Flags {
  const flags = Object.create(null) as Flags;
  flags.diffMode = 'staged';
  flags.dryRun = false;
  flags.nonInteractive = false;
  flags.useContext = true;
  flags.help = false;
  flags.version = false;
  flags.lang = undefined;
  flags.model = undefined;
  flags.doctor = false;
  flags.json = false;
  flags.autoStartNexus = false;

  let diffModeExplicitlySet = false;

  for (let i = 0; i < argv.length; i++) {
    // eslint-disable-next-line security/detect-object-injection
    const arg = argv[i];
    switch (arg) {
      case '--staged':
        if (diffModeExplicitlySet && flags.diffMode !== 'staged') {
          throw new Error('Conflicting diff mode flags specified');
        }
        flags.diffMode = 'staged';
        diffModeExplicitlySet = true;
        break;
      case '--unstaged':
        if (diffModeExplicitlySet && flags.diffMode !== 'unstaged') {
          throw new Error('Conflicting diff mode flags specified');
        }
        flags.diffMode = 'unstaged';
        diffModeExplicitlySet = true;
        break;
      case '--all':
        if (diffModeExplicitlySet && flags.diffMode !== 'all') {
          throw new Error('Conflicting diff mode flags specified');
        }
        flags.diffMode = 'all';
        diffModeExplicitlySet = true;
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--non-interactive':
        flags.nonInteractive = true;
        break;
      case '--no-context':
        flags.useContext = false;
        break;
      case '--doctor':
        flags.doctor = true;
        break;
      case '--json':
        flags.json = true;
        break;
      case '--auto-start-nexus':
        flags.autoStartNexus = true;
        break;
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '-v':
      case '--version':
        flags.version = true;
        break;
      case '--lang': {
        const value = requireNext(argv, i, '--lang');
        if (!isLang(value)) {
          throw new Error(`Invalid lang: ${value} (allowed: ${ALLOWED_LANGS.join(', ')})`);
        }
        flags.lang = value;
        i++;
        break;
      }
      case '--model': {
        flags.model = requireNext(argv, i, '--model');
        i++;
        break;
      }
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  return flags;
}
