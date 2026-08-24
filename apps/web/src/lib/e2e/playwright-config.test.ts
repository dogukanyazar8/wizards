import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function readManagedServerNodeEnv(ci: boolean): string {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    CI: ci ? "true" : "false",
  };
  Reflect.deleteProperty(environment, "PLAYWRIGHT_SKIP_WEB_SERVER");

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
        'process.stdout.write(String(server?.env?.NODE_ENV ?? "missing"));',
      ].join(" "),
    ],
    { cwd: webRoot, encoding: "utf8", env: environment },
  );

  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("local Playwright serves current source in development mode", () => {
  assert.equal(readManagedServerNodeEnv(false), "development");
});

test("CI Playwright serves the production build", () => {
  assert.equal(readManagedServerNodeEnv(true), "production");
});
