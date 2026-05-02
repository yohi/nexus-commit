import { describe, it, expect } from 'vitest';
import { validateSafeUrl } from '../src/security.js';

describe('validateSafeUrl', () => {
  it('should allow valid http/https URLs', () => {
    expect(() => validateSafeUrl(new URL('http://localhost:11434'))).not.toThrow();
    expect(() => validateSafeUrl(new URL('https://api.openai.com'))).not.toThrow();
    expect(() => validateSafeUrl(new URL('http://192.168.1.1:8080'))).not.toThrow();
  });

  it('should throw for unsupported protocols', () => {
    expect(() => validateSafeUrl(new URL('file:///etc/passwd'))).toThrow('Unsupported protocol: file:');
    expect(() => validateSafeUrl(new URL('gopher://localhost'))).toThrow('Unsupported protocol: gopher:');
  });

  it('should throw for forbidden cloud metadata hostnames/IPs', () => {
    expect(() => validateSafeUrl(new URL('http://169.254.169.254'))).toThrow('Forbidden hostname: 169.254.169.254');
    expect(() => validateSafeUrl(new URL('http://metadata.google.internal'))).toThrow('Forbidden hostname: metadata.google.internal');
    expect(() => validateSafeUrl(new URL('http://metadata.google.internal.'))).toThrow('Forbidden hostname: metadata.google.internal');
    expect(() => validateSafeUrl(new URL('http://100.100.100.200'))).toThrow('Forbidden hostname: 100.100.100.200');
    expect(() => validateSafeUrl(new URL('http://metadata'))).toThrow('Forbidden hostname: metadata');
  });

  it('should throw for forbidden IPv6 metadata addresses', () => {
    expect(() => validateSafeUrl(new URL('http://[fd00:ec2::254]'))).toThrow('Forbidden hostname: [fd00:ec2::254]');
    expect(() => validateSafeUrl(new URL('http://[fe80::4001]'))).toThrow('Forbidden hostname: [fe80::4001]');
  });
});
