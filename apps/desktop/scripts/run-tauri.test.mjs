import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");
const runTauriScript = path.join(desktopRoot, "scripts", "run-tauri.mjs");
const generatedConfigPath = path.join(
  desktopRoot,
  ".tauri",
  "generated",
  "tauri.conf.generated.json",
);

describe("desktop Tauri config generation", () => {
  it("defaults production builds to the canonical Whispr web origin", async () => {
    const productionUrl = "https://whispr.team";
    const env = { ...process.env };
    delete env.TAURI_WEB_URL;

    await execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
      cwd: desktopRoot,
      env,
    });

    const generatedConfig = JSON.parse(await readFile(generatedConfigPath, "utf8"));
    const capability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "whispr-desktop-native-ux",
    );
    const serializedConfig = JSON.stringify(generatedConfig);

    assert.equal(generatedConfig.build.frontendDist, `${productionUrl}/`);
    assert.deepEqual(capability.remote.urls, [productionUrl, `${productionUrl}/*`]);
    assert.match(generatedConfig.app.security.csp, /connect-src[^;]*https:\/\/whispr\.team/);
    assert.deepEqual(getCspDirective(generatedConfig.app.security.csp, "script-src"), [
      "'self'",
      "'wasm-unsafe-eval'",
      "blob:",
      "https://challenges.cloudflare.com",
    ]);
    assert.doesNotMatch(serializedConfig, /whispr\.invalid/);
    assert.doesNotMatch(JSON.stringify(capability.remote.urls), /http:\/\/localhost:3000/);
    assert.doesNotMatch(generatedConfig.app.security.csp, /http:\/\/localhost:\*/);
  });

  it("keeps the checked-in static CSP aligned with Krisp desktop requirements", async () => {
    const staticConfigPath = path.join(desktopRoot, "src-tauri", "tauri.conf.json");
    const staticConfig = JSON.parse(await readFile(staticConfigPath, "utf8"));

    assert.deepEqual(getCspDirective(staticConfig.app.security.csp, "script-src"), [
      "'self'",
      "'wasm-unsafe-eval'",
      "blob:",
      "https://challenges.cloudflare.com",
    ]);
  });

  it("allows an explicit HTTPS production web origin override", async () => {
    const productionUrl = "https://uat.whispr.team";

    await execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
      cwd: desktopRoot,
      env: {
        ...process.env,
        TAURI_WEB_URL: productionUrl,
      },
    });

    const generatedConfig = JSON.parse(await readFile(generatedConfigPath, "utf8"));
    const capability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "whispr-desktop-native-ux",
    );

    assert.equal(generatedConfig.build.frontendDist, `${productionUrl}/`);
    assert.deepEqual(capability.remote.urls, [productionUrl, `${productionUrl}/*`]);
  });

  it("rejects non-HTTPS production web origins", async () => {
    await assert.rejects(
      execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
        cwd: desktopRoot,
        env: {
          ...process.env,
          TAURI_WEB_URL: "http://prod.whispr.example",
        },
      }),
      /TAURI_WEB_URL must be an HTTPS origin/,
    );
  });
});

function getCspDirective(csp, directiveName) {
  const directive = csp
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${directiveName} `));

  assert.ok(directive, `Expected ${directiveName} in CSP`);

  return directive.split(/\s+/).slice(1);
}
