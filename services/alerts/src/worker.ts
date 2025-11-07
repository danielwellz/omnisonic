import { createClient } from "@clickhouse/client";
import { prisma } from "@db/client";
import type { AlertChannel, AlertEventStatus, AlertRule, TaggedEntityType } from "@prisma/client";

import {
  ALERT_INTERVAL_MS,
  CLICKHOUSE_DATABASE,
  CLICKHOUSE_HOST,
  CLICKHOUSE_PASSWORD,
  CLICKHOUSE_USER
} from "./config";
import { logger } from "./logger";
import { dispatchNotification, NotificationContext, RuleTemplate } from "./notifiers";

interface RuleWithChannel extends AlertRule {
  channel: AlertChannel;
}

interface TrendRow {
  entity_type: TaggedEntityType;
  entity_id: string;
  mentions: number;
  avg_confidence: number;
  last_seen: string;
}

function isCoolingDown(rule: AlertRule): boolean {
  if (!rule.lastTriggeredAt) return false;
  const nextAllowed = new Date(rule.lastTriggeredAt.getTime() + rule.cooldownMinutes * 60 * 1000);
  return nextAllowed > new Date();
}

async function isChannelRateLimited(channel: AlertChannel): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const usage = await prisma.alertEvent.count({
    where: {
      channelId: channel.id,
      sentAt: { gte: since },
      status: { in: ["pending", "sent"] satisfies AlertEventStatus[] }
    }
  });
  return usage >= channel.rateLimitPerHour;
}

async function hasRecentEvent(ruleId: string, entityId: string, cooldownMinutes: number): Promise<boolean> {
  const since = new Date(Date.now() - cooldownMinutes * 60 * 1000);
  const existing = await prisma.alertEvent.findFirst({
    where: {
      ruleId,
      entityId,
      sentAt: { gte: since },
      status: { in: ["pending", "sent"] }
    }
  });
  return Boolean(existing);
}

function parseTemplate(input: unknown): RuleTemplate {
  if (!input || typeof input !== "object") {
    return {};
  }
  const record = input as Record<string, unknown>;
  return {
    subject: typeof record.subject === "string" ? record.subject : undefined,
    body: typeof record.body === "string" ? record.body : undefined,
    webhookPayload:
      typeof record.webhookPayload === "string" || typeof record.webhookPayload === "object"
        ? (record.webhookPayload as Record<string, unknown> | string)
        : undefined,
    slackText: typeof record.slackText === "string" ? record.slackText : undefined
  };
}

async function fetchMatches(rule: RuleWithChannel, clickhouse: ReturnType<typeof createClient>): Promise<TrendRow[]> {
  const query = `
    SELECT
      entity_type,
      entity_id,
      count(*) AS mentions,
      avg(confidence) AS avg_confidence,
      max(linked_at) AS last_seen
    FROM insight.entity_links
    WHERE linked_at >= now() - INTERVAL {windowMinutes:UInt32} MINUTE
    ${rule.entityType ? "AND entity_type = {entityType:String}" : ""}
    ${rule.entityId ? "AND entity_id = {entityId:String}" : ""}
    GROUP BY entity_type, entity_id
    HAVING mentions >= {threshold:UInt32} AND avg_confidence >= {minConfidence:Float32}
    ORDER BY mentions DESC
    LIMIT 50
  `;

  const queryParams: Record<string, unknown> = {
    windowMinutes: rule.windowMinutes,
    threshold: rule.threshold,
    minConfidence: rule.minConfidence
  };
  if (rule.entityType) {
    queryParams.entityType = rule.entityType;
  }
  if (rule.entityId) {
    queryParams.entityId = rule.entityId;
  }

  const result = await clickhouse.query({
    query,
    query_params: queryParams
  });

  return result.json<TrendRow[]>();
}

async function processRule(rule: RuleWithChannel, clickhouse: ReturnType<typeof createClient>) {
  if (!rule.channel.isActive || !rule.isActive) {
    return;
  }
  if (isCoolingDown(rule)) {
    logger.debug({ ruleId: rule.id }, "Rule cooling down; skipping cycle");
    return;
  }

  if (await isChannelRateLimited(rule.channel)) {
    logger.warn({ channelId: rule.channelId }, "Channel hit hourly rate limit");
    return;
  }

  const matches = await fetchMatches(rule, clickhouse);
  if (!matches.length) {
    return;
  }

  for (const match of matches) {
    if (await hasRecentEvent(rule.id, match.entity_id, rule.cooldownMinutes)) {
      continue;
    }
    const context: NotificationContext = {
      entityType: match.entity_type,
      entityId: match.entity_id,
      mentions: Number(match.mentions),
      averageConfidence: Number(match.avg_confidence),
      lastSeen: match.last_seen,
      ruleName: rule.name
    };

    const event = await prisma.alertEvent.create({
      data: {
        ruleId: rule.id,
        channelId: rule.channelId,
        entityType: match.entity_type,
        entityId: match.entity_id,
        mentions: Number(match.mentions),
        confidence: Number(match.avg_confidence),
        payload: context,
        status: "pending"
      }
    });

    try {
      await dispatchNotification(rule.channel, parseTemplate(rule.template), context);
      await prisma.alertEvent.update({
        where: { id: event.id },
        data: { status: "sent", sentAt: new Date(), error: null }
      });
      await prisma.alertRule.update({ where: { id: rule.id }, data: { lastTriggeredAt: new Date() } });
      logger.info(
        { ruleId: rule.id, channelId: rule.channelId, entityId: match.entity_id },
        "Alert delivered"
      );
      break; // respect cooldown per cycle
    } catch (error) {
      await prisma.alertEvent.update({
        where: { id: event.id },
        data: {
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });
      logger.error({ err: error, ruleId: rule.id }, "Failed to send alert notification");
    }
  }
}

export async function startWorker() {
  const clickhouse = createClient({
    host: CLICKHOUSE_HOST,
    username: CLICKHOUSE_USER,
    password: CLICKHOUSE_PASSWORD,
    database: CLICKHOUSE_DATABASE
  });

  let stopped = false;

  const evaluate = async () => {
    if (stopped) return;
    try {
      const rules = await prisma.alertRule.findMany({
        where: { isActive: true, channel: { isActive: true } },
        include: { channel: true }
      });
      for (const rule of rules) {
        await processRule(rule as RuleWithChannel, clickhouse);
      }
    } catch (error) {
      logger.error({ err: error }, "Alert worker iteration failed");
    }
  };

  await evaluate();
  const interval = setInterval(() => {
    void evaluate();
  }, ALERT_INTERVAL_MS);
  interval.unref();

  logger.info({ intervalMs: ALERT_INTERVAL_MS }, "Alert worker started");

  return async () => {
    stopped = true;
    clearInterval(interval);
    await clickhouse.close();
  };
}
