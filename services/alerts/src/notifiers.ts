import nodemailer, { Transporter } from "nodemailer";
import { IncomingWebhook } from "@slack/webhook";
import type { AlertChannel, AlertChannelType } from "@prisma/client";

import {
  ALERT_EMAIL_FROM,
  DEFAULT_WEBHOOK_TIMEOUT_MS,
  SMTP_HOST,
  SMTP_PASSWORD,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER
} from "./config";
import { logger } from "./logger";

export interface NotificationContext {
  entityType: string;
  entityId: string;
  mentions: number;
  averageConfidence: number;
  lastSeen: string;
  ruleName: string;
}

export interface RuleTemplate {
  subject?: string;
  body?: string;
  webhookPayload?: Record<string, unknown> | string;
  slackText?: string;
}

const slackCache = new Map<string, IncomingWebhook>();
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) {
    return transporter;
  }
  if (!SMTP_HOST) {
    logger.debug("SMTP host not configured; email notifications disabled");
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined
  });
  return transporter;
}

function renderTemplate(template: string | undefined, context: NotificationContext): string | undefined {
  if (!template) return undefined;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
    const value = (context as Record<string, unknown>)[key];
    return value !== undefined ? String(value) : "";
  });
}

async function sendEmail(channel: AlertChannel, template: RuleTemplate, context: NotificationContext) {
  const mailer = getTransporter();
  if (!mailer) {
    throw new Error("SMTP transport unavailable");
  }
  const subject = renderTemplate(template.subject, context) ?? `Alert: ${context.entityType} ${context.entityId}`;
  const body = renderTemplate(template.body, context) ??
    `Rule ${context.ruleName} detected ${context.entityId} (${context.entityType}) with ${context.mentions} mentions.`;
  await mailer.sendMail({
    from: ALERT_EMAIL_FROM,
    to: channel.destination,
    subject,
    text: body
  });
}

async function sendWebhook(channel: AlertChannel, template: RuleTemplate, context: NotificationContext) {
  const payload = template.webhookPayload
    ? typeof template.webhookPayload === "string"
      ? JSON.parse(renderTemplate(template.webhookPayload, context) ?? "{}")
      : template.webhookPayload
    : context;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(channel.destination, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Webhook responded with status ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function sendSlack(channel: AlertChannel, template: RuleTemplate, context: NotificationContext) {
  const text = renderTemplate(template.slackText, context) ??
    `*${context.ruleName}* → ${context.entityType} ${context.entityId} seen ${context.mentions} times (avg confidence ${(context.averageConfidence * 100).toFixed(1)}%)`;
  const webhook = slackCache.get(channel.destination) ?? new IncomingWebhook(channel.destination);
  slackCache.set(channel.destination, webhook);
  await webhook.send({ text });
}

export async function dispatchNotification(
  channel: AlertChannel,
  template: RuleTemplate,
  context: NotificationContext
) {
  switch (channel.type as AlertChannelType) {
    case "email":
      await sendEmail(channel, template, context);
      break;
    case "webhook":
      await sendWebhook(channel, template, context);
      break;
    case "slack":
      await sendSlack(channel, template, context);
      break;
    default:
      throw new Error(`Unsupported channel type ${channel.type}`);
  }
}
