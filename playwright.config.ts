import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${PORT}`;
const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export default defineConfig({
  testDir: "apps/studio-web/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: `pnpm --filter @omnisonic/studio-web dev -- --turbo`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
