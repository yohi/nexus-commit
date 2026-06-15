import { z } from 'zod';

export const DaemonStateSchema = z
  .object({
    port: z.number().int().positive(),
    pid: z.number().int().positive(),
    startedAt: z.string().datetime(),
  })
  .strict();

export type DaemonState = z.infer<typeof DaemonStateSchema>;

export function parseDaemonState(raw: string): DaemonState | null {
  try {
    const parsed = JSON.parse(raw);
    return DaemonStateSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function serializeDaemonState(state: DaemonState): string {
  return JSON.stringify(state);
}
