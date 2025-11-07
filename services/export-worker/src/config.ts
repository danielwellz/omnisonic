const toInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
export const EXPORT_QUEUE_NAME = process.env.EXPORT_QUEUE_NAME ?? "mixdown-exports";
export const EXPORT_PROGRESS_CHANNEL = process.env.EXPORT_PROGRESS_CHANNEL ?? "export:progress";
export const EXPORT_WORKER_CONCURRENCY = clamp(
  toInt(process.env.EXPORT_WORKER_CONCURRENCY, 2),
  1,
  8
);
export const EXPORT_MAX_DURATION_SECONDS = clamp(toInt(process.env.EXPORT_MAX_DURATION_SECONDS, 600), 30, 3600);
export const EXPORT_DEFAULT_DURATION_SECONDS = clamp(
  toInt(process.env.EXPORT_DEFAULT_DURATION, 45),
  5,
  EXPORT_MAX_DURATION_SECONDS
);
export const EXPORT_PROGRESS_MIN_DELTA = clamp(toInt(process.env.EXPORT_PROGRESS_MIN_DELTA, 5), 1, 25);
