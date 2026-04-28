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
            message: z.object({ content: z.string() }).passthrough(),
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

/** safeParse 失敗時のエラーメッセージ整形 */
export function formatZodError(prefix: string, err: z.ZodError): Error {
  const first = err.issues[0]!;
  const path = first.path.length > 0 ? ` at ${first.path.join('.')}` : '';
  return new Error(`${prefix}${path}: ${first.message}`);
}
