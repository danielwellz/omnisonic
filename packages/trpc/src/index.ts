import { initTRPC } from "@trpc/server";
import { z } from "zod";

export const t = initTRPC.context<{}>().create();

export const appRouter = t.router({
  health: t.procedure.query(() => ({ ok: true, ts: Date.now() })),
  roomsCreate: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return { id: crypto.randomUUID(), name: input.name };
    })
});

export type AppRouter = typeof appRouter;
export const createContext = async () => ({});
