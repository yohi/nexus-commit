import { describe, it, expect } from 'vitest';
import { parseFlags } from '../src/flags.js';

describe('parseFlags', () => {
  it('returns defaults when argv is empty', () => {
    const flags = parseFlags([]);
    expect(flags).toMatchObject({
      diffMode: 'staged',
      dryRun: false,
      useContext: true,
      help: false,
      version: false,
    });
    expect(flags.lang).toBeUndefined();
    expect(flags.model).toBeUndefined();
  });

  it('sets diffMode to unstaged', () => {
    expect(parseFlags(['--unstaged']).diffMode).toBe('unstaged');
  });

  it('sets diffMode to all', () => {
    expect(parseFlags(['--all']).diffMode).toBe('all');
  });

  it('--staged explicitly preserves staged default', () => {
    expect(parseFlags(['--staged']).diffMode).toBe('staged');
  });

  it('--dry-run toggles dryRun', () => {
    expect(parseFlags(['--dry-run']).dryRun).toBe(true);
  });

  it('--no-context disables useContext', () => {
    expect(parseFlags(['--no-context']).useContext).toBe(false);
  });

  it('--lang ja is accepted', () => {
    expect(parseFlags(['--lang', 'ja']).lang).toBe('ja');
  });

  it('--lang en is accepted', () => {
    expect(parseFlags(['--lang', 'en']).lang).toBe('en');
  });

  it('throws on invalid --lang value', () => {
    expect(() => parseFlags(['--lang', 'fr'])).toThrow(/Invalid lang/);
  });

  it('throws when --lang has no value', () => {
    expect(() => parseFlags(['--lang'])).toThrow(/requires a value/);
  });

  it('--model captures next token', () => {
    expect(parseFlags(['--model', 'llama3:8b']).model).toBe('llama3:8b');
  });

  it('--model missing value should error', () => {
    expect(() => parseFlags(['--model'])).toThrow(/requires a value/);
  });

  it('combines multiple flags correctly', () => {
    const flags = parseFlags(['--lang', 'ja', '--model', 'gpt-4', '--dry-run', '--no-context']);
    expect(flags.lang).toBe('ja');
    expect(flags.model).toBe('gpt-4');
    expect(flags.dryRun).toBe(true);
    expect(flags.useContext).toBe(false);
  });

  it('-h and --help set help flag', () => {
    expect(parseFlags(['-h']).help).toBe(true);
    expect(parseFlags(['--help']).help).toBe(true);
  });

  it('-v and --version set version flag', () => {
    expect(parseFlags(['-v']).version).toBe(true);
    expect(parseFlags(['--version']).version).toBe(true);
  });

  it('throws on unknown flag', () => {
    expect(() => parseFlags(['--unknown'])).toThrow(/Unknown flag/);
  });

  it('throws on conflicting diff mode flags', () => {
    expect(() => parseFlags(['--staged', '--all'])).toThrow(/Conflicting diff mode flags/);
    expect(() => parseFlags(['--unstaged', '--staged'])).toThrow(/Conflicting diff mode flags/);
    expect(() => parseFlags(['--all', '--unstaged'])).toThrow(/Conflicting diff mode flags/);
  });
});
