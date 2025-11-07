import Redis from "ioredis";
import { EXPORT_PROGRESS_CHANNEL, REDIS_URL } from "./config";
import { logger } from "./logger";
import type { ExportProgressPayload } from "./types";

const publisher = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null
});

export async function publishProgress(payload: ExportProgressPayload) {
  try {
    await publisher.publish(EXPORT_PROGRESS_CHANNEL, JSON.stringify(payload));
  } catch (error) {
    logger.error({ err: error, exportId: payload.exportId }, "Failed to publish export progress event");
  }
}

export async function shutdownPublisher() {
  try {
    await publisher.quit();
  } catch (error) {
    logger.warn({ err: error }, "Failed to close Redis publisher");
  }
}
