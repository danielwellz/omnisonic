import pino from "pino";
import { prisma } from "@db/client";
import { LicenseStatus } from "@prisma/client";
import { createPubSub, topics } from "@omnisonic/pubsub";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const INTERVAL_MS = Number.parseInt(process.env.LICENSE_EXPIRATION_INTERVAL_MS ?? `${24 * 60 * 60 * 1000}`, 10);
const pubsub = createPubSub();

async function expireLicensesOnce() {
  const now = new Date();
  const expiring = await prisma.license.findMany({
    where: {
      status: LicenseStatus.active,
      expiresOn: {
        not: null,
        lt: now
      }
    }
  });

  if (!expiring.length) {
    logger.debug("No licenses to auto-expire");
    return;
  }

  logger.info({ count: expiring.length }, "Auto-expiring licenses");

  for (const license of expiring) {
    await prisma.license.update({
      where: { id: license.id },
      data: { status: LicenseStatus.expired }
    });

    await pubsub.publish(topics.workUpdated(license.workId), { id: license.workId });
    await pubsub.publish(topics.licenseUpdated(license.workId), { id: license.id });
  }
}

async function start() {
  logger.info({ intervalMs: INTERVAL_MS }, "Starting license expirer");
  await expireLicensesOnce();
  setInterval(() => {
    expireLicensesOnce().catch((error) => logger.error({ err: error }, "License expiration pass failed"));
  }, INTERVAL_MS).unref();
}

const shutdown = async () => {
  await pubsub.close();
  logger.info("License expirer stopped");
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error("Failed to shutdown license expirer", error);
        process.exit(1);
      });
  });
}

start().catch((error) => {
  logger.fatal({ err: error }, "License expirer failed to start");
  process.exit(1);
});
