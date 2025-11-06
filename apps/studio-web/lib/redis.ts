import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis?: Redis;
};

const redisInstance =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redisInstance;
}

export const redis = redisInstance;
