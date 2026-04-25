import { ALLOWED_LANGS, type Lang, type DiffMode } from './types.js';

export function isLang(v: string): v is Lang {
  return (ALLOWED_LANGS as readonly string[]).includes(v);
}

export interface Flags {
  diffMode: DiffMode;
  lang?: Lang;
  model?: string;
  dryRun: boolean;
  useContext: boolean;
  help: boolean;
  version: boolean;
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
  flags.useContext = true;
  flags.help = false;
  flags.version = false;
  flags.lang = undefined;
  flags.model = undefined;

  let diffModeExplicitlySet = false;

    const arg = argv[i];
    // eslint-disable-next-line
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
      case '--no-context':
        flags.useContext = false;
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
