import { Queue } from "bullmq";
import type { ExportFormat } from "@prisma/client";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const EXPORT_QUEUE_NAME = process.env.EXPORT_QUEUE_NAME ?? "mixdown-exports";

export type ExportJobPayload = {
  exportId: string;
  sessionId: string;
  userId: string;
  format: ExportFormat;
};

const globalForQueue = globalThis as unknown as {
  exportQueue?: Queue<ExportJobPayload>;
};

function createQueue() {
  return new Queue<ExportJobPayload>(EXPORT_QUEUE_NAME, {
    connection: { url: REDIS_URL }
  });
}

export const exportQueue = globalForQueue.exportQueue ?? createQueue();

if (process.env.NODE_ENV !== "production") {
  globalForQueue.exportQueue = exportQueue;
}

export async function enqueueExportJob(payload: ExportJobPayload) {
  await exportQueue.add(`export-${payload.exportId}`, payload, {
    removeOnComplete: true,
    removeOnFail: true
  });
}
