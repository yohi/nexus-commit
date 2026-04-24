const TS_RESERVED = new Set([
  'const',
  'let',
  'var',
  'function',
  'class',
  'interface',
  'type',
  'enum',
  'import',
  'export',
  'from',
  'default',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'new',
  'this',
  'super',
  'extends',
  'implements',
  'async',
  'await',
  'try',
  'catch',
  'finally',
  'throw',
  'typeof',
  'instanceof',
  'void',
  'null',
  'undefined',
  'true',
  'false',
  'static',
  'public',
  'private',
  'protected',
  'readonly',
  'abstract',
  'declare',
  'namespace',
  'module',
  'require',
  'yield',
  'with',
  'in',
  'of',
  'as',
  'is',
  'keyof',
  'infer',
  'satisfies',
  'never',
  'boolean',
  'number',
  'string',
  'symbol',
  'bigint',
  'unknown',
  'any',
  'object',
  'then',
  'Promise',
  'Array',
  'Map',
  'Set',
]);

const IDENTIFIER_RE = /\b[a-zA-Z_$][a-zA-Z0-9_$]{1,}\b/g;

export function extract(diff: string, limit = 20): string[] {
  if (!diff) {
    return [];
  }

  const freq = new Map<string, number>();

  for (const line of diff.split('\n')) {
    if (!line.startsWith('+')) {
      continue;
    }
    if (line.startsWith('+++')) {
      continue;
    }

    const body = line.slice(1);
    for (const match of body.matchAll(IDENTIFIER_RE)) {
      const token = match[0];
      if (token.length < 3 && !body.includes(`${token}(`)) {
        continue;
      }
      if (TS_RESERVED.has(token)) {
        continue;
      }
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}
