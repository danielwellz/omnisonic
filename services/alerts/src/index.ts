import { logger } from "./logger";
import { startHttpServer } from "./server";
import { startWorker } from "./worker";

async function bootstrap() {
  const server = await startHttpServer();
  const stopWorker = await startWorker();

  const shutdownSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Shutting down alerts service");
    try {
      await Promise.allSettled([
        stopWorker(),
        server.close()
      ]);
      logger.info("Alerts service stopped");
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "Failed to shut down alerts service");
      process.exit(1);
    }
  };

  shutdownSignals.forEach((signal) => {
    process.on(signal, () => {
      void shutdown(signal);
    });
  });
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, "Alerts service failed to start");
  process.exit(1);
});
