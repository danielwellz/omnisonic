import { Worker, QueueEvents, Job } from "bullmq";
import { prisma } from "@db/client";
import { ExportFormat, ExportStatus } from "@prisma/client";
import { generateExportKey, putObject, getDownloadUrl } from "@storage/index";
import { logger } from "./logger";
import {
  EXPORT_QUEUE_NAME,
  EXPORT_WORKER_CONCURRENCY,
  REDIS_URL,
  EXPORT_PROGRESS_MIN_DELTA,
  EXPORT_DEFAULT_DURATION_SECONDS
} from "./config";
import { publishProgress, shutdownPublisher } from "./publisher";
import { getMimeForFormat, renderMockMixdown } from "./ffmpeg";
import type { ExportJobData } from "./types";

const worker = new Worker<ExportJobData>(EXPORT_QUEUE_NAME, processJob, {
  connection: { url: REDIS_URL },
  concurrency: EXPORT_WORKER_CONCURRENCY
});

const queueEvents = new QueueEvents(EXPORT_QUEUE_NAME, { connection: { url: REDIS_URL } });

queueEvents.on("failed", (event) => {
  logger.error(
    { jobId: event.jobId, failedReason: event.failedReason, prev: event.prevState },
    "Export job failed"
  );
});

queueEvents.on("completed", (event) => {
  logger.info({ jobId: event.jobId, prev: event.prevState }, "Export job completed");
});

async function processJob(job: Job<ExportJobData>) {
  const { exportId, sessionId, userId, format } = job.data;
  logger.info({ exportId, sessionId, format }, "Starting export job");

  const exportRecord = await prisma.export.findUnique({ where: { id: exportId } });
  if (!exportRecord) {
    logger.warn({ exportId }, "Export record missing, skipping");
    return;
  }

  let lastProgress = exportRecord.progress ?? 0;
  const progressPromises: Promise<void>[] = [];

  const queueProgressUpdate = (progress: number, status: ExportStatus = "processing") => {
    if (progress <= lastProgress || progress - lastProgress < EXPORT_PROGRESS_MIN_DELTA) {
      return;
    }
    lastProgress = progress;
    const update = prisma.export
      .update({
        where: { id: exportId },
        data: { progress, status }
      })
      .then((updated) =>
        publishProgress({
          exportId,
          sessionId,
          status: updated.status,
          progress: updated.progress,
          format
        })
      )
      .catch((error) => {
        logger.error({ err: error, exportId }, "Failed to record progress update");
      });
    progressPromises.push(update);
  };

  const setStatus = async (
    status: ExportStatus,
    data: Record<string, unknown>,
    eventExtras?: { downloadUrl?: string | null }
  ) => {
    const updated = await prisma.export.update({
      where: { id: exportId },
      data: {
        status,
        ...data
      }
    });
    await publishProgress({
      exportId,
      sessionId,
      status: updated.status,
      progress: updated.progress,
      format,
      fileUrl: updated.fileUrl,
      downloadUrl: eventExtras?.downloadUrl ?? updated.fileUrl,
      errorMessage: updated.errorMessage,
      completedAt: updated.completedAt?.toISOString() ?? null
    });
  };

  try {
    await setStatus("processing", { progress: Math.max(lastProgress, 5), errorMessage: null });
    lastProgress = Math.max(lastProgress, 5);

    const rendered = await renderMockMixdown(
      format,
      EXPORT_DEFAULT_DURATION_SECONDS,
      (percent) => queueProgressUpdate(percent)
    );
    await Promise.all(progressPromises);

    const storageKey = generateExportKey(userId, exportId, format);
    const fileUrl = await putObject({
      key: storageKey,
      contentType: getMimeForFormat(format),
      body: rendered.buffer
    });
    const downloadUrl = await getDownloadUrl(storageKey).catch(() => null);

    await setStatus(
      "completed",
      {
        progress: 100,
        fileUrl,
        storageKey,
        fileSize: rendered.fileSize,
        completedAt: new Date()
      },
      { downloadUrl }
    );

    logger.info({ exportId, fileUrl }, "Export job completed successfully");
  } catch (error) {
    logger.error({ err: error, exportId }, "Export job failed");
    await setStatus("failed", {
      errorMessage: error instanceof Error ? error.message : "Unknown error"
    });
    throw error;
  } finally {
    await Promise.allSettled(progressPromises);
  }
}

const shutdownSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

shutdownSignals.forEach((signal) => {
  process.on(signal, () => {
    logger.info({ signal }, "Shutting down export worker");
    Promise.all([worker.close(), queueEvents.close(), shutdownPublisher()])
      .then(() => {
        logger.info("Export worker stopped cleanly");
        process.exit(0);
      })
      .catch((error) => {
        logger.error({ err: error }, "Failed to stop worker gracefully");
        process.exit(1);
      });
  });
});
