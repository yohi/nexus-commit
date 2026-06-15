import { describe, expect, test } from 'vitest';
import {
  DaemonStateSchema,
  parseDaemonState,
  serializeDaemonState,
  type DaemonState,
} from '../src/daemon-state.js';

describe('DaemonStateSchema', () => {
  test('有効なオブジェクトを検証する', () => {
    const valid = { port: 8080, pid: 12345, startedAt: '2026-06-15T10:00:00.000Z' };
    expect(DaemonStateSchema.parse(valid)).toEqual(valid);
  });

  test('port は整数で必須', () => {
    expect(() =>
      DaemonStateSchema.parse({ pid: 1, startedAt: '2026-06-15T10:00:00.000Z' }),
    ).toThrow('port');
    expect(() =>
      DaemonStateSchema.parse({ port: 0, pid: 1, startedAt: '2026-06-15T10:00:00.000Z' }),
    ).toThrow('port');
    expect(() =>
      DaemonStateSchema.parse({ port: -1, pid: 1, startedAt: '2026-06-15T10:00:00.000Z' }),
    ).toThrow('port');
    expect(() =>
      DaemonStateSchema.parse({ port: 8080.5, pid: 1, startedAt: '2026-06-15T10:00:00.000Z' }),
    ).toThrow('port');
  });

  test('pid は整数で必須', () => {
    expect(() =>
      DaemonStateSchema.parse({ port: 8080, startedAt: '2026-06-15T10:00:00.000Z' }),
    ).toThrow('pid');
    expect(() =>
      DaemonStateSchema.parse({ port: 8080, pid: 0, startedAt: '2026-06-15T10:00:00.000Z' }),
    ).toThrow('pid');
  });

  test('startedAt は ISO 8601 形式の文字列で必須', () => {
    expect(() => DaemonStateSchema.parse({ port: 8080, pid: 1 })).toThrow('startedAt');
    expect(() => DaemonStateSchema.parse({ port: 8080, pid: 1, startedAt: 'not-a-date' })).toThrow(
      'startedAt',
    );
  });

  test('余分なプロパティは許可しない', () => {
    expect(() =>
      DaemonStateSchema.parse({
        port: 8080,
        pid: 1,
        startedAt: '2026-06-15T10:00:00.000Z',
        extra: 'value',
      }),
    ).toThrow();
  });
});

describe('parseDaemonState', () => {
  test('有効な JSON 文字列をパースする', () => {
    const json = '{"port":8080,"pid":12345,"startedAt":"2026-06-15T10:00:00.000Z"}';
    expect(parseDaemonState(json)).toEqual({
      port: 8080,
      pid: 12345,
      startedAt: '2026-06-15T10:00:00.000Z',
    });
  });

  test('不正な JSON は null を返す', () => {
    expect(parseDaemonState('not json')).toBeNull();
  });

  test('スキーマ違反の JSON は null を返す', () => {
    expect(
      parseDaemonState('{"port":0,"pid":1,"startedAt":"2026-06-15T10:00:00.000Z"}'),
    ).toBeNull();
  });
});

describe('serializeDaemonState', () => {
  test('状態を JSON 文字列にシリアライズする', () => {
    const state: DaemonState = { port: 8080, pid: 12345, startedAt: '2026-06-15T10:00:00.000Z' };
    expect(serializeDaemonState(state)).toBe(
      '{"port":8080,"pid":12345,"startedAt":"2026-06-15T10:00:00.000Z"}',
    );
  });
});
