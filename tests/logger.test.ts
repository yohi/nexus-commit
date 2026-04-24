import { describe, it, expect, vi } from 'vitest';
import { logger } from '../src/logger.js';

describe('logger', () => {
  it('info writes to stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('hello');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('hello'));
    spy.mockRestore();
  });

  it('dim writes to stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.dim('faint');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('faint'));
    spy.mockRestore();
  });

  it('warn writes to stderr', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('warning');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('error writes to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('oops');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
