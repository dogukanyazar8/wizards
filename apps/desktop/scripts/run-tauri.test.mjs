import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");
const runTauriScript = path.join(desktopRoot, "scripts", "run-tauri.mjs");
const generatedDirectory = await mkdtemp(path.join(tmpdir(), "whispr-tauri-config-test-"));
after(() => {
  assert.equal(path.dirname(path.resolve(generatedDirectory)), path.resolve(tmpdir()));
  assert.ok(path.basename(generatedDirectory).startsWith("whispr-tauri-config-test-"));
  return rm(generatedDirectory, { recursive: true, force: true });
});
const generatedConfigPath = path.join(generatedDirectory, "tauri.conf.generated.json");
const isolatedDesktopEnvKeys = [
  "TAURI_APP_NAME",
  "TAURI_DEV_WEB_URL",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "TAURI_WEB_URL",
  "WINDOWS_CERTIFICATE_PASSWORD",
  "WINDOWS_CERTIFICATE_PFX_BASE64",
  "WHISPR_DESKTOP_BUILD_TIME",
  "WHISPR_DESKTOP_RELEASE_RING",
  "WHISPR_DESKTOP_UPDATER_ENABLED",
  "WHISPR_DESKTOP_UPDATER_ENDPOINT",
  "WHISPR_DESKTOP_UPDATER_ENDPOINTS",
  "WHISPR_DESKTOP_UPDATER_PUBLIC_KEY",
  "WHISPR_DESKTOP_WINDOWS_SIGNING_CERT_KIND",
  "WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED",
];

describe("desktop Tauri config generation", () => {
  it("defaults production builds to the canonical Whispr web origin", async () => {
    const productionUrl = "https://whispr.team";

    await execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
      cwd: desktopRoot,
      env: testDesktopEnv(),
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
    const desktopControlCapability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "desktop-control",
    );
    const serializedConfig = JSON.stringify(generatedConfig);

    assert.equal(generatedConfig.build.frontendDist, `${productionUrl}/`);
    assert.deepEqual(capability.remote.urls, [productionUrl, `${productionUrl}/*`]);
    assert.deepEqual(voiceMiniCapability.remote.urls, [productionUrl, `${productionUrl}/*`]);
    assert.deepEqual(gameOverlayCapability.remote.urls, [productionUrl, `${productionUrl}/*`]);
    assert.equal(desktopControlCapability.remote, undefined);
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
    assert.ok(capability.permissions.includes("allow-configure-desktop-voice-shortcuts"));
    assert.ok(capability.permissions.includes("allow-export-desktop-diagnostics-bundle"));
    assert.ok(
      !desktopControlCapability.permissions.includes("allow-configure-desktop-voice-shortcuts"),
    );
    assert.ok(
      !desktopControlCapability.permissions.includes("allow-export-desktop-diagnostics-bundle"),
    );
    assert.ok(
      capability.permissions.includes("allow-record-desktop-update-failure"),
      "Expected updater failure logs to be available only through the main window capability.",
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

  it("enables macOS private APIs for transparent companion windows", async () => {
    await execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
      cwd: desktopRoot,
      env: testDesktopEnv(),
    });

    const staticConfigPath = path.join(desktopRoot, "src-tauri", "tauri.conf.json");
    const [generatedConfig, staticConfig] = await Promise.all([
      readFile(generatedConfigPath, "utf8").then(JSON.parse),
      readFile(staticConfigPath, "utf8").then(JSON.parse),
    ]);

    assert.equal(generatedConfig.app.macOSPrivateApi, true);
    assert.equal(staticConfig.app.macOSPrivateApi, true);
  });

  it("uses the Whispr icon for NSIS installer and uninstaller binaries", async () => {
    const staticConfigPath = path.join(desktopRoot, "src-tauri", "tauri.conf.json");
    const staticConfig = JSON.parse(await readFile(staticConfigPath, "utf8"));

    assert.equal(staticConfig.bundle.windows.nsis.installerIcon, "icons/icon.ico");
    assert.equal(staticConfig.bundle.windows.nsis.uninstallerIcon, "icons/icon.ico");
    assert.ok(
      staticConfig.bundle.icon.includes("icons/icon.ico"),
      "The app icon bundle must keep the same Whispr .ico used by the installer.",
    );
  });

  it("allows an explicit HTTPS production web origin override", async () => {
    const productionUrl = "https://uat.whispr.team";

    await execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
      cwd: desktopRoot,
      env: testDesktopEnv({
        TAURI_WEB_URL: productionUrl,
      }),
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

  it("allows no-bundle only for unsigned native build signals", async () => {
    await execFileAsync(
      process.execPath,
      [runTauriScript, "build", "--", "--no-bundle", "--write-config-only"],
      {
        cwd: desktopRoot,
        env: testDesktopEnv(),
      },
    );

    await assert.rejects(
      execFileAsync(process.execPath, [runTauriScript, "dev", "--no-bundle"], {
        cwd: desktopRoot,
        env: testDesktopEnv(),
      }),
      /--no-bundle is only supported for production builds/,
    );
  });

  it("enables signed updater configuration only with explicit HTTPS manifest settings", async () => {
    const productionUrl = "https://uat.whispr.team";
    const updateEndpoint = "https://updates.whispr.team/desktop/uat/latest.json";
    const updaterPublicKey = "trusted-ed25519-public-key";

    await execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
      cwd: desktopRoot,
      env: testDesktopEnv({
        TAURI_WEB_URL: productionUrl,
        WHISPR_DESKTOP_RELEASE_RING: "uat",
        WHISPR_DESKTOP_UPDATER_ENABLED: "true",
        WHISPR_DESKTOP_UPDATER_ENDPOINTS: updateEndpoint,
        WHISPR_DESKTOP_UPDATER_PUBLIC_KEY: updaterPublicKey,
        WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED: "true",
        WINDOWS_CERTIFICATE_PASSWORD: "test-certificate-password",
        WINDOWS_CERTIFICATE_PFX_BASE64: "dGVzdC1jZXJ0aWZpY2F0ZQ==",
      }),
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
    const desktopControlCapability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "desktop-control",
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
    assert.match(generatedConfig.bundle.windows.signCommand.args[4], /sign-windows-artifact\.ps1$/);
    assert.equal(generatedConfig.bundle.windows.signCommand.args[5], "%1");
    assert.deepEqual(generatedConfig.plugins.updater, {
      endpoints: [updateEndpoint],
      pubkey: updaterPublicKey,
      windows: {
        installMode: "passive",
      },
    });
    assert.ok(!mainCapability.permissions.some((permission) => permission.startsWith("updater:")));
    assert.ok(!mainCapability.permissions.includes("process:allow-restart"));
    assert.ok(!mainCapability.permissions.includes("notification:allow-request-permission"));
    assert.ok(mainCapability.permissions.includes("allow-desktop-control-check-for-updates"));
    assert.ok(mainCapability.permissions.includes("allow-desktop-control-install-update"));
    assert.ok(!desktopControlCapability.permissions.includes("updater:allow-check"));
    assert.ok(!desktopControlCapability.permissions.includes("updater:allow-download-and-install"));
    assert.ok(!desktopControlCapability.permissions.includes("process:allow-restart"));
    assert.ok(mainCapability.permissions.includes("allow-record-desktop-update-failure"));
    assert.ok(!mainCapability.permissions.includes("process:allow-exit"));
    assert.ok(
      !voiceMiniCapability.permissions.some((permission) => permission.startsWith("updater:")),
    );
    assert.ok(
      !voiceMiniCapability.permissions.some((permission) => permission.startsWith("process:")),
    );
    assert.deepEqual(gameOverlayCapability.permissions, []);
    assertOnlyProductionRemoteUrls(generatedConfig, productionUrl);
    assert.doesNotMatch(JSON.stringify(generatedConfig), /http:\/\/localhost|whispr\.invalid/);
  });

  it("keeps generated desktop permissions aligned with the main window capability", async () => {
    await execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
      cwd: desktopRoot,
      env: testDesktopEnv(),
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
    const staticDesktopControlCapability = JSON.parse(
      await readFile(
        path.join(desktopRoot, "src-tauri", "capabilities", "desktop-control.json"),
        "utf8",
      ),
    );
    const generatedDesktopControlCapability = generatedConfig.app.security.capabilities.find(
      (entry) => entry.identifier === "desktop-control",
    );

    assert.ok(generatedCapability, "Expected generated main capability");
    assert.ok(generatedVoiceMiniCapability, "Expected generated voice mini capability");
    assert.ok(generatedGameOverlayCapability, "Expected generated game overlay capability");
    assert.ok(generatedDesktopControlCapability, "Expected generated Desktop Control capability");
    assert.deepEqual(
      [...generatedCapability.permissions].sort(),
      [...staticCapability.permissions].sort(),
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
      generatedDesktopControlCapability.permissions,
      staticDesktopControlCapability.permissions,
      "Generated builds must keep Desktop Control permissions aligned.",
    );
    assert.equal(generatedDesktopControlCapability.remote, undefined);
    assert.deepEqual(
      generatedGameOverlayCapability.permissions,
      [],
      "The game overlay capability must stay empty unless a dedicated security review widens it.",
    );
    assert.ok(
      !generatedVoiceMiniCapability.permissions.some((permission) =>
        permission.startsWith("allow-"),
      ),
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
      /if desktop_updater_enabled\s*\{[\s\S]*tauri_plugin_updater::Builder::new\(\)\.build\(\)[\s\S]*\}/,
      "The updater plugin must stay behind the signed-updater runtime flag so dev builds without updater config do not panic.",
    );
    assert.doesNotMatch(
      rustSource,
      /tauri_plugin_process::init\(\)/,
      "The frontend process plugin must not expose a restart bypass around the confirmed Rust updater command.",
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
      /option_env!\("WHISPR_DESKTOP_BUILD_TIME"\)/,
      "Installed release builds must preserve the build-time desktop timestamp.",
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
      /cargo:rerun-if-env-changed=WHISPR_DESKTOP_BUILD_TIME/,
      "Cargo must rebuild the desktop binary when the desktop build timestamp changes.",
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
        env: testDesktopEnv({
          TAURI_WEB_URL: "http://prod.whispr.example",
        }),
      }),
      /TAURI_WEB_URL must be an HTTPS origin/,
    );
  });

  it("rejects invalid desktop build timestamps", async () => {
    await assert.rejects(
      execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
        cwd: desktopRoot,
        env: testDesktopEnv({
          WHISPR_DESKTOP_BUILD_TIME: "not-a-date",
        }),
      }),
      /WHISPR_DESKTOP_BUILD_TIME must be a valid ISO-8601 timestamp/,
    );
  });

  it("rejects incomplete or unsafe updater release configuration", async () => {
    await assert.rejects(
      execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
        cwd: desktopRoot,
        env: testDesktopEnv({
          WHISPR_DESKTOP_UPDATER_ENABLED: "true",
          WHISPR_DESKTOP_UPDATER_ENDPOINTS: "https://updates.whispr.team/desktop/uat/latest.json",
        }),
      }),
      /WHISPR_DESKTOP_UPDATER_PUBLIC_KEY is required/,
    );

    await assert.rejects(
      execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
        cwd: desktopRoot,
        env: testDesktopEnv({
          WHISPR_DESKTOP_UPDATER_ENABLED: "true",
          WHISPR_DESKTOP_UPDATER_ENDPOINTS: "http://localhost:3000/latest.json",
          WHISPR_DESKTOP_UPDATER_PUBLIC_KEY: "trusted-ed25519-public-key",
          WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED: "true",
          WINDOWS_CERTIFICATE_PASSWORD: "test-certificate-password",
          WINDOWS_CERTIFICATE_PFX_BASE64: "dGVzdC1jZXJ0aWZpY2F0ZQ==",
        }),
      }),
      /TAURI_WEB_URL must be an HTTPS origin|Desktop updater endpoints must not point/,
    );

    await assert.rejects(
      execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
        cwd: desktopRoot,
        env: testDesktopEnv({
          WHISPR_DESKTOP_RELEASE_RING: "nightly",
          WHISPR_DESKTOP_UPDATER_ENABLED: "true",
          WHISPR_DESKTOP_UPDATER_ENDPOINTS: "https://updates.whispr.team/desktop/uat/latest.json",
          WHISPR_DESKTOP_UPDATER_PUBLIC_KEY: "trusted-ed25519-public-key",
        }),
      }),
      /WHISPR_DESKTOP_RELEASE_RING must be one of/,
    );
  });
});

it("allows updater verification without Windows Authenticode signing in either ring", async () => {
  for (const ring of ["uat", "stable"]) {
    const endpoint = `https://updates.whispr.team/desktop/${ring}/latest.json`;
    await execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
      cwd: desktopRoot,
      env: testDesktopEnv({
        TAURI_WEB_URL: "https://whispr.team/",
        WHISPR_DESKTOP_RELEASE_RING: ring,
        WHISPR_DESKTOP_UPDATER_ENABLED: "true",
        WHISPR_DESKTOP_UPDATER_ENDPOINTS: endpoint,
        WHISPR_DESKTOP_UPDATER_PUBLIC_KEY: "trusted-ed25519-public-key",
        WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED: "false",
      }),
    });
    const config = JSON.parse(await readFile(generatedConfigPath, "utf8"));
    assert.equal(config.bundle.createUpdaterArtifacts, true);
    assert.equal(config.bundle.windows.signCommand, undefined);
    assert.equal(config.bundle.windows.certificateThumbprint, undefined);
    assert.equal(config.plugins.updater.pubkey, "trusted-ed25519-public-key");
    assert.deepEqual(config.plugins.updater.endpoints, [endpoint]);
  }
});

it("still rejects incomplete Windows certificates when signing is explicitly enabled", async () => {
  for (const overrides of [{}, { WINDOWS_CERTIFICATE_PFX_BASE64: "dGVzdC1jZXJ0aWZpY2F0ZQ==" }]) {
    await assert.rejects(
      execFileAsync(process.execPath, [runTauriScript, "build", "--write-config-only"], {
        cwd: desktopRoot,
        env: testDesktopEnv({ WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED: "true", ...overrides }),
      }),
      /WINDOWS_CERTIFICATE_(PFX_BASE64|PASSWORD) is required/,
    );
  }
});

it("preserves fixed IPC transports in generated dev and build configurations", async () => {
  for (const mode of ["dev", "build"]) {
    await execFileAsync(process.execPath, [runTauriScript, mode, "--write-config-only"], {
      cwd: desktopRoot,
      env: testDesktopEnv(),
    });
    const config = JSON.parse(await readFile(generatedConfigPath, "utf8"));
    const sources = getCspDirective(config.app.security.csp, "connect-src");
    for (const source of ["ipc:", "http://ipc.localhost", "https://ipc.localhost"]) {
      assert.ok(sources.includes(source), `${mode}: missing ${source}`);
    }
    assert.ok(!sources.includes("*"));
    assert.ok(!sources.includes("http:"));
    assert.ok(!sources.includes("https:"));
  }
});

function testDesktopEnv(overrides = {}) {
  const env = { ...process.env };

  for (const key of isolatedDesktopEnvKeys) {
    delete env[key];
  }

  return {
    ...env,
    ...overrides,
    WHISPR_DESKTOP_CONFIG_OUTPUT_DIR: generatedDirectory,
  };
}

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
    if (capability.identifier === "desktop-control") {
      assert.equal(capability.remote, undefined);
      continue;
    }

    assert.deepEqual(
      capability.remote.urls,
      [productionUrl, `${productionUrl}/*`],
      `${capability.identifier} must only allow the selected production web origin.`,
    );
  }
}
