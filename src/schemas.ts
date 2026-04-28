import { z } from 'zod';

/** Nexus API: POST /api/search レスポンス */
export const NexusResultItemSchema = z.object({
  file: z.string(),
  content: z.string(),
});

export const NexusSearchResponseSchema = z.object({
  results: z.array(NexusResultItemSchema),
});

/** OpenAI 互換: POST /v1/chat/completions レスポンス */
export const ChatCompletionResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z.object({ content: z.string().nullable() }).passthrough(),
          })
          .passthrough(),
      )
      .min(1, 'choices must contain at least one item'),
  })
  .passthrough();

/** OpenAI 互換: GET /v1/models レスポンス */
export const ModelListResponseSchema = z
  .object({
    data: z.array(z.object({ id: z.string() }).passthrough()),
  })
  .passthrough();

/** safeParse 失敗時のエラーメッセージ整形（すべてのエラーパスを報告） */
export function formatZodError(prefix: string, err: z.ZodError): Error {
  const allPaths = err.issues
    .map(i => (i.path.length > 0 ? i.path.join('.') : '<root>'))
    .join(', ');
  const firstMsg = err.issues[0]?.message ?? 'unknown validation error';
  return new Error(`${prefix} (paths: ${allPaths}): ${firstMsg}`);
}
