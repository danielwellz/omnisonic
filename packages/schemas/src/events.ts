import { z } from "zod";

export const UsageEvent = z.object({
  id: z.string().uuid(),
  recordingId: z.string(),
  userId: z.string(),
  usageType: z.enum(["play_start","play_complete"]),
  durationMs: z.number().int().nonnegative(),
  territory: z.string(),
  ts: z.number()
});

export type UsageEvent = z.infer<typeof UsageEvent>;
