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
      (entry) => entry.identifier === "main",
    );
    const voiceMiniCapability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "voice-mini",
    );
    const gameOverlayCapability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "game-overlay",
    );
    const serializedConfig = JSON.stringify(generatedConfig);

    assert.equal(generatedConfig.build.frontendDist, `${productionUrl}/`);
    assert.deepEqual(capability.remote.urls, [productionUrl, `${productionUrl}/*`]);
    assert.deepEqual(voiceMiniCapability.remote.urls, [productionUrl, `${productionUrl}/*`]);
    assert.deepEqual(gameOverlayCapability.remote.urls, [productionUrl, `${productionUrl}/*`]);
    assert.ok(
      getCspDirective(generatedConfig.app.security.csp, "connect-src").includes(productionUrl),
      "Expected production HTTPS origin in connect-src",
    );
    assert.ok(
      getCspDirective(generatedConfig.app.security.csp, "connect-src").includes(
        "wss://whispr.team",
      ),
      "Expected production WebSocket origin in connect-src",
    );
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
      (entry) => entry.identifier === "main",
    );

    assert.equal(generatedConfig.build.frontendDist, `${productionUrl}/`);
    assert.deepEqual(capability.remote.urls, [productionUrl, `${productionUrl}/*`]);
    assert.ok(
      getCspDirective(generatedConfig.app.security.csp, "connect-src").includes(
        "wss://uat.whispr.team",
      ),
      "Expected override WebSocket origin in connect-src",
    );
  });

  it("keeps generated desktop permissions aligned with the main window capability", async () => {
    const env = { ...process.env };
    delete env.TAURI_WEB_URL;

    await execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
      cwd: desktopRoot,
      env,
    });

    const generatedConfig = JSON.parse(await readFile(generatedConfigPath, "utf8"));
    const staticCapability = JSON.parse(
      await readFile(path.join(desktopRoot, "src-tauri", "capabilities", "main.json"), "utf8"),
    );
    const generatedCapability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "main",
    );
    const staticVoiceMiniCapability = JSON.parse(
      await readFile(
        path.join(desktopRoot, "src-tauri", "capabilities", "voice-mini.json"),
        "utf8",
      ),
    );
    const generatedVoiceMiniCapability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "voice-mini",
    );
    const staticGameOverlayCapability = JSON.parse(
      await readFile(
        path.join(desktopRoot, "src-tauri", "capabilities", "game-overlay.json"),
        "utf8",
      ),
    );
    const generatedGameOverlayCapability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "game-overlay",
    );

    assert.ok(generatedCapability, "Expected generated main capability");
    assert.ok(generatedVoiceMiniCapability, "Expected generated voice mini capability");
    assert.ok(generatedGameOverlayCapability, "Expected generated game overlay capability");
    assert.deepEqual(
      generatedCapability.permissions,
      staticCapability.permissions,
      "Generated builds must not silently widen or narrow the checked-in main capability permissions.",
    );
    assert.deepEqual(
      generatedVoiceMiniCapability.permissions,
      staticVoiceMiniCapability.permissions,
      "Generated builds must keep the voice mini window least-privilege capability aligned.",
    );
    assert.deepEqual(
      generatedGameOverlayCapability.permissions,
      staticGameOverlayCapability.permissions,
      "Generated builds must keep the game overlay read-only capability aligned.",
    );
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
