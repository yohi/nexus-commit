import { describe, it, expect } from 'vitest';
import { validateSafeUrl } from '../src/security.js';

describe('validateSafeUrl', () => {
  it.each([
    'http://localhost:11434',
    'https://api.openai.com',
    'http://192.168.1.1:8080',
  ])('should allow valid http/https URL: %s', (url) => {
    expect(() => validateSafeUrl(new URL(url))).not.toThrow();
  });

  it.each([
    ['file:///etc/passwd', 'Unsupported protocol: file:'],
    ['gopher://localhost', 'Unsupported protocol: gopher:'],
  ])('should throw for unsupported protocol: %s', (url, expected) => {
    expect(() => validateSafeUrl(new URL(url))).toThrow(expected);
  });

  it.each([
    'http://169.254.169.254',
    'http://metadata.google.internal',
    'http://metadata.google.internal.',
    'http://100.100.100.200',
    'http://metadata',
    'http://[fd00:ec2::254]',
    'http://[fe80::4001]',
    'http://[::ffff:169.254.169.254]',
    'http://[::ffff:a9fe:a9fe]',
    'http://[::FFFF:A9FE:A9FE]',
  ])('should throw for forbidden metadata host/IP: %s', (url) => {
    expect(() => validateSafeUrl(new URL(url))).toThrow(/Forbidden hostname:/);
  });
});
