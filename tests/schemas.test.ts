import { describe, it, expect } from 'vitest';
import {
  NexusSearchResponseSchema,
  ChatCompletionResponseSchema,
  ModelListResponseSchema,
  formatZodError,
} from '../src/schemas.js';

describe('NexusSearchResponseSchema', () => {
  it('正常な results を受理する', () => {
    const data = { results: [{ file: 'a.ts', content: 'x' }] };
    const parsed = NexusSearchResponseSchema.safeParse(data);
    expect(parsed.success).toBe(true);
  });

  it('results が配列でない場合に失敗する', () => {
    const parsed = NexusSearchResponseSchema.safeParse({ results: 'oops' });
    expect(parsed.success).toBe(false);
  });

  it('results 配列要素の file が文字列でない場合に失敗する', () => {
    const parsed = NexusSearchResponseSchema.safeParse({
      results: [{ file: 123, content: 'x' }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('ChatCompletionResponseSchema', () => {
  it('choices[0].message.content が文字列なら成功する', () => {
    const data = { choices: [{ message: { content: 'feat: ok' } }] };
    expect(ChatCompletionResponseSchema.safeParse(data).success).toBe(true);
  });

  it('choices が空配列なら min(1) で失敗する', () => {
    const parsed = ChatCompletionResponseSchema.safeParse({ choices: [] });
    expect(parsed.success).toBe(false);
  });

  it('choices 自体が欠落していたら失敗する', () => {
    expect(ChatCompletionResponseSchema.safeParse({}).success).toBe(false);
  });

  it('未定義フィールド (refusal 等) は passthrough で許容される', () => {
    const data = {
      choices: [
        {
          message: { content: 'ok', refusal: null },
          finish_reason: 'stop',
        },
      ],
      id: 'chatcmpl-xxx',
    };
    expect(ChatCompletionResponseSchema.safeParse(data).success).toBe(true);
  });
});

describe('ModelListResponseSchema', () => {
  it('data[].id が文字列なら成功する', () => {
    const data = {
      data: [{ id: 'qwen2.5-coder:7b' }, { id: 'llama3.2:3b' }],
    };
    expect(ModelListResponseSchema.safeParse(data).success).toBe(true);
  });

  it('data が配列でなければ失敗する', () => {
    expect(ModelListResponseSchema.safeParse({ data: 'oops' }).success).toBe(false);
  });

  it('未定義フィールド (object/created 等) は passthrough で許容される', () => {
    const data = {
      object: 'list',
      data: [{ id: 'a', object: 'model', created: 0, owned_by: 'system' }],
    };
    expect(ModelListResponseSchema.safeParse(data).success).toBe(true);
  });
});

describe('formatZodError', () => {
  it('prefix と path と message を組み立てる', () => {
    const parsed = NexusSearchResponseSchema.safeParse({ results: 'oops' });
    if (parsed.success) throw new Error('expected failure');
    const err = formatZodError('Invalid Nexus response', parsed.error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/^Invalid Nexus response at results: /);
  });

  it('path が空なら prefix と message のみ', () => {
    const parsed = NexusSearchResponseSchema.safeParse('not-an-object');
    if (parsed.success) throw new Error('expected failure');
    const err = formatZodError('Invalid Nexus response', parsed.error);
    expect(err.message).toMatch(/^Invalid Nexus response: /);
  });
});
