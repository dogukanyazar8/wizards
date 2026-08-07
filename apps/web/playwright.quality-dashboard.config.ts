import { defineConfig, devices } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(webRoot, "..", "..");
const baseURL = "http://127.0.0.1:47833";
const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);

Object.assign(webServerEnv, {
  NODE_ENV: "test",
  WHISPR_QUALITY_DASHBOARD_TEST_MODE: "1",
  E2E_DATABASE_URL: "postgresql://quality:local-only@127.0.0.1:5432/wizards_e2e",
  REDIS_URL: "redis://127.0.0.1:6379",
});

export default defineConfig({
  testDir: "./e2e/local-quality-dashboard",
  globalTeardown: "./e2e/local-quality-dashboard/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: resolve(repositoryRoot, "test-results", "quality-dashboard"),
  reporter: "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node tools/local-quality-dashboard/server.mjs --port 47833 --no-open",
    cwd: repositoryRoot,
    env: webServerEnv,
    reuseExistingServer: false,
    timeout: 30_000,
    url: baseURL,
  },
});
