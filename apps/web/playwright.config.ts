import { defineConfig, devices } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const isCI = process.env.CI === "true";
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1";
const useDevelopmentWebServer = !isCI && process.env.E2E_USE_DEV_SERVER === "1";

/**
 * Ekran paylaşımı Ş0.3 (K18, T12, T13) — gerçek-medya projesi.
 *
 * Sahte sağlayıcı (`E2EVoiceProvider`) `NEXT_PUBLIC_E2E_TEST_MODE` ile takılır; bu proje aynı
 * test modunda (seed, `/api/e2e` oturumu) koşar ama `NEXT_PUBLIC_E2E_VOICE_REAL_MEDIA=true`
 * ile gerçek `getDisplayMedia` + gerçek LiveKit (`--dev` sunucusu, `devkey`/`secret`) kullanır.
 * Proje adı `--project=chromium-real-media` ile istenince web sunucusu bu bayrakla derlenir
 * (`NEXT_PUBLIC_*` derleme zamanında gömülür); bayrak ortamdan da verilebilir.
 */
export const REAL_MEDIA_PROJECT_NAME = "chromium-real-media";
export const REAL_MEDIA_SPEC_MATCH = "**/voice/screen-share-real-media.spec.ts";
export const REAL_MEDIA_FLAG_ENV = "NEXT_PUBLIC_E2E_VOICE_REAL_MEDIA";
export const REAL_MEDIA_WINDOW = { height: 1080, width: 1920 } as const;
/** `--auto-select-tab-capture-source-by-title` ile yakalanan desen sekmesinin başlığı. */
export const SCREEN_PATTERN_PAGE_TITLE = "Whispr screen pattern";
export const SCREEN_PATTERN_PAGE_PATH = "/e2e/screen-pattern";
export const REAL_MEDIA_BASE_CHROMIUM_ARGS = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  `--window-size=${REAL_MEDIA_WINDOW.width},${REAL_MEDIA_WINDOW.height}`,
  "--autoplay-policy=no-user-gesture-required",
] as const;
/** Headless Chromium sanal ekranı yakalar; boyutu `--window-size` verir (T12). */
export const REAL_MEDIA_CHROMIUM_ARGS = [
  ...REAL_MEDIA_BASE_CHROMIUM_ARGS,
  "--auto-select-desktop-capture-source=Entire screen",
] as const;
/** Desen grubu ekranı değil başlığı eşleşen sekmeyi yakalar (glass-to-glass ölçümü). */
export const SCREEN_PATTERN_CHROMIUM_ARGS = [
  // The fake-device switch also replaces getDisplayMedia with green test frames.
  // This group supplies a silent microphone in its fixture and captures the real tab.
  ...REAL_MEDIA_BASE_CHROMIUM_ARGS.filter((argument) => !argument.startsWith("--use-fake-")),
  `--auto-select-tab-capture-source-by-title=${SCREEN_PATTERN_PAGE_TITLE}`,
] as const;
export const REAL_MEDIA_LIVEKIT_DEV_URL = "ws://127.0.0.1:7880";
export const REAL_MEDIA_LIVEKIT_DEV_API_KEY = "devkey";
export const REAL_MEDIA_LIVEKIT_DEV_API_SECRET = "secret";

function isRealMediaProjectRequested(argv: readonly string[], env: NodeJS.ProcessEnv): boolean {
  if (env[REAL_MEDIA_FLAG_ENV] === "true") {
    return true;
  }

  return argv.some(
    (argument, index) =>
      argument === `--project=${REAL_MEDIA_PROJECT_NAME}` ||
      (argument === REAL_MEDIA_PROJECT_NAME && argv[index - 1] === "--project"),
  );
}

const realMediaRequested = isRealMediaProjectRequested(process.argv, process.env);
const e2eTestTimeout = isCI ? 75_000 : 30_000;
const e2eExpectTimeout = isCI ? 30_000 : 10_000;
const e2eActionTimeout = isCI ? 30_000 : 15_000;
const e2eNavigationTimeout = isCI ? 60_000 : 30_000;
const turnstileTestSiteKey = ["1x", "0".repeat(20), "AA"].join("");
const turnstileTestSecretKey = ["1x", "0".repeat(31), "AA"].join("");
const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);

webServerEnv.E2E_TEST_MODE = process.env.E2E_TEST_MODE ?? "true";
webServerEnv.E2E_MOCK_GIPHY = process.env.E2E_MOCK_GIPHY ?? "true";
if (!useDevelopmentWebServer) {
  webServerEnv.E2E_ALLOW_PRODUCTION_BUILD = "true";
  webServerEnv.NEXT_PUBLIC_E2E_ALLOW_PRODUCTION_BUILD = "true";
}
webServerEnv.DATABASE_URL = process.env.E2E_DATABASE_URL ?? "";
webServerEnv.APP_URL = baseURL;
webServerEnv.AUTH_URL = baseURL;
webServerEnv.NEXTAUTH_URL = baseURL;
webServerEnv.NEXT_PUBLIC_E2E_TEST_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE ?? "true";
webServerEnv.NEXT_PUBLIC_WHISPR_CHAT_PREVIEW =
  process.env.NEXT_PUBLIC_WHISPR_CHAT_PREVIEW ?? "true";
webServerEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? turnstileTestSiteKey;
webServerEnv.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? turnstileTestSecretKey;
webServerEnv.UPLOADTHING_TOKEN = process.env.UPLOADTHING_TOKEN ?? "e2e-uploadthing-token";
// Real media talks to a local `livekit-server --dev`, whose default keys are `devkey`/`secret`.
webServerEnv.LIVEKIT_API_KEY =
  process.env.LIVEKIT_API_KEY ??
  (realMediaRequested ? REAL_MEDIA_LIVEKIT_DEV_API_KEY : "e2e-livekit-api-key");
webServerEnv.LIVEKIT_API_SECRET =
  process.env.LIVEKIT_API_SECRET ??
  (realMediaRequested ? REAL_MEDIA_LIVEKIT_DEV_API_SECRET : "e2e-livekit-api-secret");
webServerEnv.LIVEKIT_URL = process.env.LIVEKIT_URL ?? REAL_MEDIA_LIVEKIT_DEV_URL;
if (realMediaRequested) {
  webServerEnv[REAL_MEDIA_FLAG_ENV] = "true";
}
webServerEnv.NEXT_PUBLIC_LIVEKIT_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL ?? webServerEnv.LIVEKIT_URL;
webServerEnv.NODE_ENV = useDevelopmentWebServer ? "development" : "production";
webServerEnv.AUTH_SECRET = process.env.AUTH_SECRET ?? "whispr-e2e-auth-secret-change-me-local-only";
webServerEnv.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? webServerEnv.AUTH_SECRET;
webServerEnv.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--max-old-space-size=4096"]
  .filter(Boolean)
  .join(" ");
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
  timeout: e2eTestTimeout,
  expect: {
    timeout: e2eExpectTimeout,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
      stylePath: join(webRoot, "e2e", "visual-screenshot.css"),
    },
  },
  outputDir: "test-results",
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    actionTimeout: e2eActionTimeout,
    navigationTimeout: e2eNavigationTimeout,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // The real-media spec needs the live provider build; the fake-provider project ignores it.
      testIgnore: REAL_MEDIA_SPEC_MATCH,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    },
    {
      name: REAL_MEDIA_PROJECT_NAME,
      testMatch: REAL_MEDIA_SPEC_MATCH,
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 1,
        launchOptions: {
          args: [...REAL_MEDIA_CHROMIUM_ARGS],
        },
        viewport: { ...REAL_MEDIA_WINDOW },
      },
    },
    {
      name: "firefox",
      testIgnore: REAL_MEDIA_SPEC_MATCH,
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: {
          firefoxUserPrefs: {
            "media.navigator.permission.disabled": true,
            "media.navigator.streams.fake": true,
            "permissions.default.camera": 1,
            "permissions.default.microphone": 1,
          },
        },
      },
    },
    {
      name: "webkit",
      // Playwright WebKit has no reliable headless fake camera/microphone device contract.
      testIgnore: "**/voice/voice.spec.ts",
      use: {
        ...devices["Desktop Safari"],
      },
    },
  ],
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: useDevelopmentWebServer ? "pnpm dev" : "pnpm run e2e:web-server",
          cwd: webRoot,
          env: webServerEnv,
          reuseExistingServer: useDevelopmentWebServer,
          timeout: useDevelopmentWebServer ? 120_000 : 300_000,
          url: baseURL,
        },
      }),
});
