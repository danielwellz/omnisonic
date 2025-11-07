export const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST ?? "http://localhost:8123";
export const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER ?? "omnisonic";
export const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD ?? "omnisonic";
export const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE ?? "insight";

export const ALERT_THRESHOLD = Number(process.env.ALERT_THRESHOLD ?? "10");
export const ALERT_INTERVAL_MS = Number(process.env.ALERT_INTERVAL_MS ?? "60000");
export const ALERT_HTTP_PORT = Number(process.env.ALERTS_PORT ?? "8200");

export const SMTP_HOST = process.env.ALERTS_SMTP_HOST ?? process.env.SMTP_HOST ?? "";
export const SMTP_PORT = Number(process.env.ALERTS_SMTP_PORT ?? process.env.SMTP_PORT ?? "587");
export const SMTP_USER = process.env.ALERTS_SMTP_USER ?? process.env.SMTP_USER ?? "";
export const SMTP_PASSWORD = process.env.ALERTS_SMTP_PASSWORD ?? process.env.SMTP_PASSWORD ?? "";
export const SMTP_SECURE = (process.env.ALERTS_SMTP_SECURE ?? process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
export const ALERT_EMAIL_FROM = process.env.ALERTS_EMAIL_FROM ?? "alerts@omnisonic.test";

export const DEFAULT_WEBHOOK_TIMEOUT_MS = Number(process.env.ALERTS_WEBHOOK_TIMEOUT_MS ?? "10000");
