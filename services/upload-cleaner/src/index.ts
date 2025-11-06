import pino from "pino";
import { prisma } from "@db/client";
import { deleteObject } from "@storage/index";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const RETENTION_DAYS = Number(process.env.UPLOAD_RETENTION_DAYS ?? "30");
const BATCH_SIZE = Number(process.env.UPLOAD_CLEANUP_BATCH ?? "100");
const INTERVAL_MS = Number(process.env.UPLOAD_CLEANUP_INTERVAL_MS ?? 1000 * 60 * 60 * 6);

async function cleanupOnce() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const staleUploads = await prisma.upload.findMany({
    where: {
      sessionId: null,
      createdAt: { lt: cutoff }
    },
    take: BATCH_SIZE
  });

  if (!staleUploads.length) {
    logger.info("No stale uploads found");
    return;
  }

  logger.info({ count: staleUploads.length }, "Cleaning up uploads");

  for (const upload of staleUploads) {
    try {
      await deleteObject(upload.storageKey);
      await prisma.upload.delete({ where: { id: upload.id } });
      logger.info({ id: upload.id }, "Deleted upload");
    } catch (error) {
      logger.error({ err: error, id: upload.id }, "Failed to clean upload");
    }
  }
}

async function start() {
  logger.info({ retentionDays: RETENTION_DAYS }, "Starting upload cleaner");
  await cleanupOnce();
  setInterval(() => {
    cleanupOnce().catch((error) => logger.error({ err: error }, "Cleanup iteration failed"));
  }, INTERVAL_MS).unref();
}

start().catch((error) => {
  logger.fatal({ err: error }, "Upload cleaner failed to start");
  process.exit(1);
});
