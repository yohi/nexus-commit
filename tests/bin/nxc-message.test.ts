import { describe, expect, it } from 'vitest';

import { cleanupGeneratedMessage } from '../../src/bin/nxc.js';

describe('cleanupGeneratedMessage', () => {
  it('cleans up a multiline fenced commit message', () => {
    expect(cleanupGeneratedMessage('```\nfeat: x\n```')).toBe('feat: x');
  });

  it('cleans up a single-line fenced commit message', () => {
    expect(cleanupGeneratedMessage('```feat: y```')).toBe('feat: y');
  });
});
