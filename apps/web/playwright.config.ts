import { defineConfig, devices } from "@playwright/test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const isCI = process.env.CI === "true";
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1";
const turnstileTestSiteKey = ["1x", "0".repeat(20), "AA"].join("");
const turnstileTestSecretKey = ["1x", "0".repeat(31), "AA"].join("");
const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);

webServerEnv.E2E_TEST_MODE = process.env.E2E_TEST_MODE ?? "true";
webServerEnv.E2E_MOCK_GIPHY = process.env.E2E_MOCK_GIPHY ?? "true";
webServerEnv.DATABASE_URL = process.env.E2E_DATABASE_URL ?? "";
webServerEnv.APP_URL = baseURL;
webServerEnv.AUTH_URL = baseURL;
webServerEnv.NEXTAUTH_URL = baseURL;
webServerEnv.NEXT_PUBLIC_E2E_TEST_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE ?? "true";
webServerEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? turnstileTestSiteKey;
webServerEnv.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? turnstileTestSecretKey;
webServerEnv.UPLOADTHING_TOKEN = process.env.UPLOADTHING_TOKEN ?? "e2e-uploadthing-token";
webServerEnv.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? "e2e-livekit-api-key";
webServerEnv.LIVEKIT_API_SECRET =
  process.env.LIVEKIT_API_SECRET ?? "e2e-livekit-api-secret";
webServerEnv.LIVEKIT_URL = process.env.LIVEKIT_URL ?? "ws://127.0.0.1:7880";
webServerEnv.NEXT_PUBLIC_LIVEKIT_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL ?? webServerEnv.LIVEKIT_URL;
webServerEnv.AUTH_SECRET =
  process.env.AUTH_SECRET ?? "whispr-e2e-auth-secret-change-me-local-only";
webServerEnv.NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET ?? webServerEnv.AUTH_SECRET;
webServerEnv.NODE_OPTIONS = [
  process.env.NODE_OPTIONS,
  "--max-old-space-size=4096",
].filter(Boolean).join(" ");
if (process.env.NODE_V8_COVERAGE) {
  webServerEnv.NODE_V8_COVERAGE = process.env.NODE_V8_COVERAGE;
}

export default defineConfig({
  testDir: "./e2e/specs",
  globalSetup: "./e2e/setup/global-setup.ts",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: "test-results",
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
          ],
        },
      },
    },
  ],
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: isCI ? "pnpm run e2e:web-server" : "pnpm dev",
          cwd: webRoot,
          env: webServerEnv,
          reuseExistingServer: !isCI,
          timeout: 120_000,
          url: baseURL,
        },
      }),
});
