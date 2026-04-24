import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from '../src/logger.js';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info writes to stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('hello');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('hello'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('dim writes to stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.dim('faint');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('faint'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('warn writes to stderr', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('warning');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('error writes to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('oops');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
