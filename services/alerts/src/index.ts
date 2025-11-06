import { createClient } from "@clickhouse/client";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined
});

const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST ?? "http://localhost:8123";
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER ?? "omnisonic";
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD ?? "omnisonic";
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE ?? "insight";

const THRESHOLD = Number(process.env.ALERT_THRESHOLD ?? "10");
const INTERVAL_MS = Number(process.env.ALERT_INTERVAL_MS ?? "60000");

const client = createClient({
  host: CLICKHOUSE_HOST,
  username: CLICKHOUSE_USER,
  password: CLICKHOUSE_PASSWORD,
  database: CLICKHOUSE_DATABASE
});

async function checkTrends() {
  try {
    const query = `
      SELECT
        entity_type,
        entity_id,
        count(*) AS mentions,
        avg(confidence) AS avg_confidence,
        max(linked_at) AS last_seen
      FROM insight.entity_links
      WHERE linked_at >= now() - INTERVAL 7 DAY
      GROUP BY entity_type, entity_id
      HAVING mentions >= {threshold:UInt32}
      ORDER BY mentions DESC
      LIMIT 50
    `;

    const result = await client.query({
      query,
      query_params: { threshold: THRESHOLD }
    });

    const rows = await result.json<{
      entity_type: string;
      entity_id: string;
      mentions: number;
      avg_confidence: number;
      last_seen: string;
    }[]>();

    rows.forEach((row) => {
      logger.info(
        {
          entityType: row.entity_type,
          entityId: row.entity_id,
          mentions: row.mentions,
          averageConfidence: Number(row.avg_confidence.toFixed(2)),
          lastSeen: row.last_seen
        },
        "Alert: trending entity"
      );
    });

    if (!rows.length) {
      logger.debug("No threshold crossings detected");
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to check trends");
  }
}

async function start() {
  logger.info(
    {
      host: CLICKHOUSE_HOST,
      database: CLICKHOUSE_DATABASE,
      threshold: THRESHOLD,
      intervalMs: INTERVAL_MS
    },
    "Starting alerts service"
  );

  await checkTrends();
  setInterval(checkTrends, INTERVAL_MS).unref();
}

start().catch((error) => {
  logger.fatal({ err: error }, "Alerts service failed to start");
  process.exit(1);
});
