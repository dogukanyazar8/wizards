import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function readManagedServer(ci: boolean, useDevelopmentServer = false) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    CI: ci ? "true" : "false",
  };
  Reflect.deleteProperty(environment, "PLAYWRIGHT_SKIP_WEB_SERVER");
  Reflect.deleteProperty(environment, "E2E_USE_DEV_SERVER");
  if (useDevelopmentServer) {
    environment.E2E_USE_DEV_SERVER = "1";
  }

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      [
        'import config from "./playwright.config.ts";',
        "const server = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;",
        "process.stdout.write(JSON.stringify({ command: server?.command, nodeEnv: server?.env?.NODE_ENV, previewEnabled: server?.env?.NEXT_PUBLIC_WHISPR_CHAT_PREVIEW, reuseExistingServer: server?.reuseExistingServer }));",
      ].join(" "),
    ],
    { cwd: webRoot, encoding: "utf8", env: environment },
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as {
    command?: string;
    nodeEnv?: string;
    previewEnabled?: string;
    reuseExistingServer?: boolean;
  };
}

test("local Playwright uses the immutable production build by default", () => {
  assert.deepEqual(readManagedServer(false), {
    command: "pnpm run e2e:web-server",
    nodeEnv: "production",
    previewEnabled: "true",
    reuseExistingServer: false,
  });
});

test("CI Playwright serves the production build", () => {
  assert.deepEqual(readManagedServer(true), {
    command: "pnpm run e2e:web-server",
    nodeEnv: "production",
    previewEnabled: "true",
    reuseExistingServer: false,
  });
});

test("local Playwright development server requires an explicit opt-in", () => {
  assert.deepEqual(readManagedServer(false, true), {
    command: "pnpm dev",
    nodeEnv: "development",
    previewEnabled: "true",
    reuseExistingServer: true,
  });
});
