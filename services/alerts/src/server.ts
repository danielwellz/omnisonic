import Fastify from "fastify";
import { z } from "zod";
import { prisma } from "@db/client";

import { ALERT_HTTP_PORT } from "./config";
import { logger } from "./logger";

const channelSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["email", "webhook", "slack"]),
  destination: z.string().min(1),
  config: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
  rateLimitPerHour: z.number().int().min(1).max(500).optional()
});

const ruleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  channelId: z.string().uuid(),
  entityType: z.enum(["artist", "work", "recording"]).nullable().optional(),
  entityId: z.string().min(1).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  threshold: z.number().int().min(1).optional(),
  windowMinutes: z.number().int().min(5).max(1440).optional(),
  cooldownMinutes: z.number().int().min(1).max(1440).optional(),
  template: z.record(z.any()).optional(),
  isActive: z.boolean().optional()
});

export async function startHttpServer() {
  const app = Fastify({ logger });

  app.setErrorHandler((error, _request, reply) => {
    logger.error({ err: error }, "Alerts API error");
    reply.status((error as { statusCode?: number }).statusCode ?? 400).send({ error: error.message });
  });

  app.get("/health", () => ({ ok: true, ts: Date.now() }));

  app.get("/channels", async () => {
    const channels = await prisma.alertChannel.findMany({ orderBy: { createdAt: "desc" } });
    return channels;
  });

  app.post("/channels", async (request, reply) => {
    const body = channelSchema.parse(request.body);
    const channel = await prisma.alertChannel.create({
      data: {
        name: body.name,
        type: body.type,
        destination: body.destination,
        config: body.config ?? undefined,
        isActive: body.isActive ?? true,
        rateLimitPerHour: body.rateLimitPerHour ?? 30
      }
    });
    reply.code(201);
    return channel;
  });

  app.patch<{ Params: { id: string } }>("/channels/:id", async (request, reply) => {
    const body = channelSchema.partial().parse(request.body);
    const channel = await prisma.alertChannel.update({
      where: { id: request.params.id },
      data: {
        ...body,
        config: body.config ?? undefined
      }
    });
    return channel;
  });

  app.delete<{ Params: { id: string } }>("/channels/:id", async (request, reply) => {
    await prisma.alertChannel.delete({ where: { id: request.params.id } });
    reply.code(204);
  });

  app.get("/rules", async () => {
    const rules = await prisma.alertRule.findMany({
      include: { channel: true },
      orderBy: { createdAt: "desc" }
    });
    return rules;
  });

  app.post("/rules", async (request, reply) => {
    const body = ruleSchema.parse(request.body);
    const rule = await prisma.alertRule.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        channelId: body.channelId,
        entityType: body.entityType ?? undefined,
        entityId: body.entityId ?? undefined,
        minConfidence: body.minConfidence ?? 0.7,
        threshold: body.threshold ?? 10,
        windowMinutes: body.windowMinutes ?? 60,
        cooldownMinutes: body.cooldownMinutes ?? 30,
        template: body.template ?? undefined,
        isActive: body.isActive ?? true
      },
      include: { channel: true }
    });
    reply.code(201);
    return rule;
  });

  app.patch<{ Params: { id: string } }>("/rules/:id", async (request) => {
    const body = ruleSchema.partial().parse(request.body);
    const rule = await prisma.alertRule.update({
      where: { id: request.params.id },
      data: {
        ...body,
        entityType: body.entityType ?? undefined,
        entityId: body.entityId ?? undefined,
        template: body.template ?? undefined,
        description: body.description ?? undefined
      },
      include: { channel: true }
    });
    return rule;
  });

  app.delete<{ Params: { id: string } }>("/rules/:id", async (request, reply) => {
    await prisma.alertRule.delete({ where: { id: request.params.id } });
    reply.code(204);
  });

  await app.listen({ port: ALERT_HTTP_PORT, host: "0.0.0.0" });
  logger.info({ port: ALERT_HTTP_PORT }, "Alerts HTTP server ready");
  return app;
}
