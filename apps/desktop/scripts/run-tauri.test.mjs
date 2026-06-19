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
    assertOnlyProductionRemoteUrls(generatedConfig, productionUrl);
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
    assert.doesNotMatch(serializedConfig, /http:\/\/localhost:3000/);
    assert.doesNotMatch(serializedConfig, /http:\/\/127\.0\.0\.1:3000/);
    assert.doesNotMatch(generatedConfig.app.security.csp, /http:\/\/localhost:\*/);
    assert.deepEqual(
      gameOverlayCapability.permissions,
      [],
      "The game overlay must remain a read-only window with no command permissions.",
    );
    assert.equal(
      generatedConfig.plugins.updater,
      undefined,
      "Desktop updater must stay disabled unless explicitly configured for a signed release.",
    );
    assert.equal(
      generatedConfig.bundle?.createUpdaterArtifacts,
      undefined,
      "Updater artifacts must not be produced until updater signing is explicitly enabled.",
    );
    assert.ok(
      capability.permissions.includes("allow-configure-desktop-voice-shortcuts"),
      "Expected explicit app command permissions on the main window capability.",
    );
    assert.ok(
      !voiceMiniCapability.permissions.some((permission) => permission.startsWith("allow-")),
      "The voice mini window must not receive custom app command permissions.",
    );
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
    assertOnlyProductionRemoteUrls(generatedConfig, productionUrl);
    assert.ok(
      getCspDirective(generatedConfig.app.security.csp, "connect-src").includes(
        "wss://uat.whispr.team",
      ),
      "Expected override WebSocket origin in connect-src",
    );
  });

  it("enables signed updater configuration only with explicit HTTPS manifest settings", async () => {
    const productionUrl = "https://uat.whispr.team";
    const updateEndpoint = "https://updates.whispr.team/desktop/uat/latest.json";
    const updaterPublicKey = "trusted-ed25519-public-key";

    await execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
      cwd: desktopRoot,
      env: {
        ...process.env,
        TAURI_WEB_URL: productionUrl,
        WHISPR_DESKTOP_RELEASE_RING: "uat",
        WHISPR_DESKTOP_UPDATER_ENABLED: "true",
        WHISPR_DESKTOP_UPDATER_ENDPOINTS: updateEndpoint,
        WHISPR_DESKTOP_UPDATER_PUBLIC_KEY: updaterPublicKey,
        WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED: "true",
        WINDOWS_CERTIFICATE_PASSWORD: "test-certificate-password",
        WINDOWS_CERTIFICATE_PFX_BASE64: "dGVzdC1jZXJ0aWZpY2F0ZQ==",
      },
    });

    const generatedConfig = JSON.parse(await readFile(generatedConfigPath, "utf8"));
    const mainCapability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "main",
    );
    const voiceMiniCapability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "voice-mini",
    );
    const gameOverlayCapability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "game-overlay",
    );

    assert.equal(generatedConfig.bundle.createUpdaterArtifacts, true);
    assert.equal(generatedConfig.bundle.windows.digestAlgorithm, "sha256");
    assert.equal(generatedConfig.bundle.windows.timestampUrl, "http://timestamp.digicert.com");
    assert.equal(generatedConfig.bundle.windows.signCommand.cmd, "powershell");
    assert.deepEqual(generatedConfig.bundle.windows.signCommand.args.slice(0, 4), [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
    ]);
    assert.match(
      generatedConfig.bundle.windows.signCommand.args[4],
      /sign-windows-artifact\.ps1$/,
    );
    assert.equal(generatedConfig.bundle.windows.signCommand.args[5], "%1");
    assert.deepEqual(generatedConfig.plugins.updater, {
      endpoints: [updateEndpoint],
      pubkey: updaterPublicKey,
      windows: {
        installMode: "basicUi",
      },
    });
    assert.ok(mainCapability.permissions.includes("updater:allow-check"));
    assert.ok(mainCapability.permissions.includes("updater:allow-download-and-install"));
    assert.ok(mainCapability.permissions.includes("process:allow-restart"));
    assert.ok(!mainCapability.permissions.includes("process:allow-exit"));
    assert.ok(!voiceMiniCapability.permissions.some((permission) => permission.startsWith("updater:")));
    assert.ok(!voiceMiniCapability.permissions.some((permission) => permission.startsWith("process:")));
    assert.deepEqual(gameOverlayCapability.permissions, []);
    assertOnlyProductionRemoteUrls(generatedConfig, productionUrl);
    assert.doesNotMatch(JSON.stringify(generatedConfig), /http:\/\/localhost|whispr\.invalid/);
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
    assert.deepEqual(
      generatedGameOverlayCapability.permissions,
      [],
      "The game overlay capability must stay empty unless a dedicated security review widens it.",
    );
    assert.ok(
      !generatedVoiceMiniCapability.permissions.some((permission) => permission.startsWith("allow-")),
      "The voice mini capability must not be granted custom app commands.",
    );
    assert.ok(
      generatedCapability.permissions.every(
        (permission) => permission !== "allow-dispatch-desktop-voice-mini-command",
      ),
      "The removed voice mini relay command must not return through generated config.",
    );
  });

  it("registers updater runtime plugins only when the signed updater is enabled", async () => {
    const rustSource = await readFile(path.join(desktopRoot, "src-tauri", "src", "lib.rs"), "utf8");

    assert.match(
      rustSource,
      /if desktop_updater_enabled\s*\{[\s\S]*tauri_plugin_process::init\(\)[\s\S]*tauri_plugin_updater::Builder::new\(\)\.build\(\)[\s\S]*\}/,
      "Updater and process plugins must stay behind the signed-updater runtime flag so dev builds without updater config do not panic.",
    );
  });

  it("embeds release runtime configuration so installed builds do not require process env", async () => {
    const rustSource = await readFile(path.join(desktopRoot, "src-tauri", "src", "lib.rs"), "utf8");
    const buildScript = await readFile(path.join(desktopRoot, "src-tauri", "build.rs"), "utf8");

    assert.match(
      rustSource,
      /option_env!\("WHISPR_DESKTOP_WEB_URL"\)/,
      "Installed release builds must fall back to the build-time web URL instead of requiring a machine-wide environment variable.",
    );
    assert.match(
      rustSource,
      /option_env!\("WHISPR_DESKTOP_RELEASE_RING"\)/,
      "Installed release builds must preserve the build-time release ring.",
    );
    assert.match(
      rustSource,
      /option_env!\("WHISPR_DESKTOP_UPDATER_ENABLED"\)/,
      "Installed release builds must preserve whether the signed updater was enabled at build time.",
    );
    assert.match(
      buildScript,
      /cargo:rerun-if-env-changed=WHISPR_DESKTOP_WEB_URL/,
      "Cargo must rebuild the desktop binary when the target web origin changes.",
    );
    assert.match(
      buildScript,
      /cargo:rerun-if-env-changed=WHISPR_DESKTOP_RELEASE_RING/,
      "Cargo must rebuild the desktop binary when the release ring changes.",
    );
    assert.match(
      buildScript,
      /cargo:rerun-if-env-changed=WHISPR_DESKTOP_UPDATER_ENABLED/,
      "Cargo must rebuild the desktop binary when updater enablement changes.",
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

  it("rejects incomplete or unsafe updater release configuration", async () => {
    await assert.rejects(
      execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
        cwd: desktopRoot,
        env: {
          ...process.env,
          WHISPR_DESKTOP_UPDATER_ENABLED: "true",
          WHISPR_DESKTOP_UPDATER_ENDPOINTS: "https://updates.whispr.team/desktop/uat/latest.json",
        },
      }),
      /WHISPR_DESKTOP_UPDATER_PUBLIC_KEY is required/,
    );

    await assert.rejects(
      execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
        cwd: desktopRoot,
        env: {
          ...process.env,
          WHISPR_DESKTOP_UPDATER_ENABLED: "true",
          WHISPR_DESKTOP_UPDATER_ENDPOINTS: "https://updates.whispr.team/desktop/uat/latest.json",
          WHISPR_DESKTOP_UPDATER_PUBLIC_KEY: "trusted-ed25519-public-key",
        },
      }),
      /WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED=true is required/,
    );

    await assert.rejects(
      execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
        cwd: desktopRoot,
        env: {
          ...process.env,
          WHISPR_DESKTOP_UPDATER_ENABLED: "true",
          WHISPR_DESKTOP_UPDATER_ENDPOINTS: "http://localhost:3000/latest.json",
          WHISPR_DESKTOP_UPDATER_PUBLIC_KEY: "trusted-ed25519-public-key",
          WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED: "true",
          WINDOWS_CERTIFICATE_PASSWORD: "test-certificate-password",
          WINDOWS_CERTIFICATE_PFX_BASE64: "dGVzdC1jZXJ0aWZpY2F0ZQ==",
        },
      }),
      /TAURI_WEB_URL must be an HTTPS origin|Desktop updater endpoints must not point/,
    );

    await assert.rejects(
      execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
        cwd: desktopRoot,
        env: {
          ...process.env,
          WHISPR_DESKTOP_RELEASE_RING: "nightly",
          WHISPR_DESKTOP_UPDATER_ENABLED: "true",
          WHISPR_DESKTOP_UPDATER_ENDPOINTS: "https://updates.whispr.team/desktop/uat/latest.json",
          WHISPR_DESKTOP_UPDATER_PUBLIC_KEY: "trusted-ed25519-public-key",
        },
      }),
      /WHISPR_DESKTOP_RELEASE_RING must be one of/,
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

function assertOnlyProductionRemoteUrls(generatedConfig, productionUrl) {
  const capabilities = generatedConfig.app.security.capabilities ?? [];
  assert.ok(capabilities.length > 0, "Expected generated capabilities");

  for (const capability of capabilities) {
    assert.deepEqual(
      capability.remote.urls,
      [productionUrl, `${productionUrl}/*`],
      `${capability.identifier} must only allow the selected production web origin.`,
    );
  }
}
