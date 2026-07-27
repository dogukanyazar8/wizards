import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { DESKTOP_RELEASE_RINGS } from "./release-ops.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");
const generatedDir = path.join(desktopRoot, ".tauri", "generated");
const generatedConfigPath = path.join(generatedDir, "tauri.conf.generated.json");
const defaultProductionWebUrl = "https://whispr.team";
const updaterReleaseRings = new Set(DESKTOP_RELEASE_RINGS);

const command = process.argv[2];
const rawExtraArgs = process.argv.slice(3);
const extraArgs = rawExtraArgs[0] === "--" ? rawExtraArgs.slice(1) : rawExtraArgs;
const writeConfigOnly = extraArgs.includes("--write-config-only");
const noBundle = extraArgs.includes("--no-bundle");
const unknownArgs = extraArgs.filter(
  (arg) => arg !== "--write-config-only" && arg !== "--no-bundle",
);

if (!["dev", "build"].includes(command) || unknownArgs.length > 0) {
  console.error(
    "Usage: node ./scripts/run-tauri.mjs <dev|build> [--no-bundle] [--write-config-only]",
  );
  process.exit(1);
}

if (noBundle && command !== "build") {
  console.error("--no-bundle is only supported for production builds.");
  process.exit(1);
}

const appName = process.env.TAURI_APP_NAME || "Whispr";
const windowsSigningConfig = resolveWindowsSigningConfig();
const devUrl = parseUrl(
  process.env.TAURI_DEV_WEB_URL || "http://localhost:3000",
  "TAURI_DEV_WEB_URL",
);
const webUrl =
  command === "dev"
    ? devUrl
    : parseProductionUrl(process.env.TAURI_WEB_URL || defaultProductionWebUrl);
const updaterConfig = resolveUpdaterConfig(command);
const desktopBuildTime = resolveDesktopBuildTime();
const capabilityUrls =
  command === "dev"
    ? Array.from(
        new Set([
          ...capabilityUrlPatterns(devUrl),
          ...capabilityUrlPatterns(new URL("http://localhost:3000")),
          ...capabilityUrlPatterns(new URL("http://127.0.0.1:3000")),
        ]),
      )
    : capabilityUrlPatterns(webUrl);
const appCommandPermissions = [
  "allow-complete-desktop-before-close",
  "allow-configure-desktop-voice-shortcuts",
  "allow-export-desktop-diagnostics-bundle",
  "allow-get-desktop-app-info",
  "allow-get-desktop-companion-surfaces-status",
  "allow-get-desktop-foreground-process-name",
  "allow-get-desktop-main-window-focused",
  "allow-get-desktop-platform-capabilities",
  "allow-get-desktop-voice-shortcut-status",
  "allow-promote-desktop-main-window",
  "allow-publish-desktop-game-overlay-snapshot",
  "allow-publish-desktop-voice-mini-snapshot",
  "allow-record-desktop-update-failure",
  "allow-refresh-desktop-companion-surfaces",
  "allow-set-desktop-activity-status",
  "allow-set-desktop-game-overlay-visible",
  "allow-set-desktop-voice-mini-visible",
];
const nativeUxPermissions = [
  ...appCommandPermissions,
  ...(updaterConfig.enabled
    ? ["updater:allow-check", "updater:allow-download-and-install", "process:allow-restart"]
    : []),
  "notification:allow-is-permission-granted",
  "notification:allow-notify",
  "notification:allow-request-permission",
  "core:window:allow-close",
  "core:window:allow-center",
  "core:event:allow-listen",
  "core:event:allow-unlisten",
  "core:window:allow-internal-toggle-maximize",
  "core:window:allow-is-focused",
  "core:window:allow-minimize",
  "core:window:allow-set-min-size",
  "core:window:allow-set-resizable",
  "core:window:allow-set-size",
  "core:window:allow-show",
  "core:window:allow-start-dragging",
  "core:window:allow-toggle-maximize",
  "window-state:default",
];
const voiceMiniPermissions = ["core:window:allow-start-dragging"];
const gameOverlayPermissions = [];
const desktopCsp = buildDesktopCsp(webUrl, command);
const tauriEnv = {
  ...process.env,
  PATH: withRustupPath(process.env.PATH),
  WHISPR_DESKTOP_APP_NAME: appName,
  WHISPR_DESKTOP_BUILD_TIME: desktopBuildTime,
  WHISPR_DESKTOP_RELEASE_RING: updaterConfig.releaseRing,
  WHISPR_DESKTOP_UPDATER_ENABLED: updaterConfig.enabled ? "true" : "false",
  WHISPR_DESKTOP_WEB_URL: webUrl.href,
};
const pluginsConfig = {
  "deep-link": {
    desktop: {
      schemes: ["whispr"],
    },
  },
  ...(updaterConfig.enabled
    ? {
        updater: {
          endpoints: updaterConfig.endpoints.map((endpoint) => endpoint.href),
          pubkey: updaterConfig.publicKey,
          windows: {
            installMode: "passive",
          },
        },
      }
    : {}),
};
const bundleConfig = updaterConfig.enabled
  ? buildUpdaterBundleConfig(windowsSigningConfig)
  : undefined;

await mkdir(generatedDir, { recursive: true });

await writeFile(
  generatedConfigPath,
  `${JSON.stringify(
    {
      productName: appName,
      build: {
        devUrl: command === "dev" ? devUrl.href : webUrl.href,
        frontendDist: webUrl.href,
      },
      app: {
        withGlobalTauri: false,
        windows: [],
        security: {
          csp: desktopCsp,
          capabilities: [
            {
              identifier: "main",
              description:
                "Whispr's primary desktop window receives the minimal permissions required for native notifications, custom window chrome, startup promotion, and persisted window state.",
              windows: ["main"],
              remote: {
                urls: capabilityUrls,
              },
              permissions: nativeUxPermissions,
            },
            {
              identifier: "voice-mini",
              description:
                "Whispr's compact voice mini window receives only the window-drag permission it needs; voice data is delivered through sanitized app commands from the main window.",
              windows: ["voice-mini"],
              remote: {
                urls: capabilityUrls,
              },
              permissions: voiceMiniPermissions,
            },
            {
              identifier: "game-overlay",
              description:
                "Whispr's read-only game overlay receives no webview command permissions; sanitized voice state is pushed by the main window through Rust-owned app commands.",
              windows: ["game-overlay"],
              remote: {
                urls: capabilityUrls,
              },
              permissions: gameOverlayPermissions,
            },
          ],
        },
      },
      ...(bundleConfig ? { bundle: bundleConfig } : {}),
      plugins: pluginsConfig,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`[Whispr Desktop] mode: ${command}`);
console.log(`[Whispr Desktop] web target: ${webUrl.href}`);
console.log(`[Whispr Desktop] generated config: ${generatedConfigPath}`);
console.log(`[Whispr Desktop] allowed web origins: ${capabilityUrls.join(", ")}`);
console.log(`[Whispr Desktop] native permissions: ${nativeUxPermissions.join(", ")}`);
console.log(`[Whispr Desktop] voice mini permissions: ${voiceMiniPermissions.join(", ")}`);
console.log(
  `[Whispr Desktop] game overlay permissions: ${gameOverlayPermissions.join(", ") || "(none)"}`,
);
console.log(
  `[Whispr Desktop] updater: ${
    updaterConfig.enabled
      ? `enabled (${updaterConfig.releaseRing}, ${updaterConfig.endpoints
          .map((endpoint) => endpoint.href)
          .join(", ")})`
      : "disabled"
  }`,
);

if (writeConfigOnly) {
  console.log("[Whispr Desktop] config-only mode: skipping Tauri CLI invocation");
  process.exit(0);
}

const child = spawn(
  process.execPath,
  [
    require.resolve("@tauri-apps/cli/tauri.js"),
    command,
    "--config",
    generatedConfigPath,
    ...(noBundle ? ["--no-bundle"] : []),
  ],
  {
    cwd: desktopRoot,
    env: tauriEnv,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }

  process.exit(code ?? 1);
});

function parseProductionUrl(value) {
  const url = parseUrl(value, "TAURI_WEB_URL");

  if (url.protocol !== "https:") {
    console.error("TAURI_WEB_URL must be an HTTPS origin.");
    process.exit(1);
  }

  return url;
}

function resolveUpdaterConfig(mode) {
  const enabled = isEnabledValue(process.env.WHISPR_DESKTOP_UPDATER_ENABLED);
  const releaseRing = parseUpdaterReleaseRing(process.env.WHISPR_DESKTOP_RELEASE_RING || "uat");

  if (!enabled) {
    return {
      enabled: false,
      endpoints: [],
      publicKey: "",
      releaseRing,
    };
  }

  if (mode !== "build") {
    console.error("WHISPR_DESKTOP_UPDATER_ENABLED can only be used for production builds.");
    process.exit(1);
  }

  const publicKey = (process.env.WHISPR_DESKTOP_UPDATER_PUBLIC_KEY || "").trim();
  if (!publicKey) {
    console.error("WHISPR_DESKTOP_UPDATER_PUBLIC_KEY is required when desktop updater is enabled.");
    process.exit(1);
  }

  if (!windowsSigningConfig.enabled) {
    console.error(
      "WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED=true is required when desktop updater is enabled.",
    );
    process.exit(1);
  }

  const endpointValues = parseUpdaterEndpointValues(
    process.env.WHISPR_DESKTOP_UPDATER_ENDPOINTS ||
      process.env.WHISPR_DESKTOP_UPDATER_ENDPOINT ||
      "",
  );

  if (endpointValues.length === 0) {
    console.error(
      "WHISPR_DESKTOP_UPDATER_ENDPOINTS must include at least one HTTPS latest.json endpoint when desktop updater is enabled.",
    );
    process.exit(1);
  }

  return {
    enabled: true,
    endpoints: endpointValues.map(parseUpdaterEndpoint),
    publicKey,
    releaseRing,
  };
}

function resolveDesktopBuildTime() {
  const explicitBuildTime = process.env.WHISPR_DESKTOP_BUILD_TIME?.trim();

  if (explicitBuildTime) {
    const parsedBuildTime = new Date(explicitBuildTime);

    if (Number.isNaN(parsedBuildTime.getTime())) {
      console.error("WHISPR_DESKTOP_BUILD_TIME must be a valid ISO-8601 timestamp.");
      process.exit(1);
    }

    return parsedBuildTime.toISOString();
  }

  return new Date().toISOString();
}

function buildUpdaterBundleConfig(signingConfig) {
  return {
    createUpdaterArtifacts: true,
    windows: {
      ...(signingConfig.enabled
        ? {
            digestAlgorithm: "sha256",
            signCommand: {
              args: [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                signingConfig.scriptPath,
                "%1",
              ],
              cmd: "powershell",
            },
            timestampUrl: "http://timestamp.digicert.com",
          }
        : {}),
    },
  };
}

function resolveWindowsSigningConfig() {
  const enabled = isEnabledValue(process.env.WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED);

  if (!enabled) {
    return {
      enabled: false,
      scriptPath: "",
    };
  }

  if (!process.env.WINDOWS_CERTIFICATE_PFX_BASE64?.trim()) {
    console.error("WINDOWS_CERTIFICATE_PFX_BASE64 is required when Windows signing is enabled.");
    process.exit(1);
  }

  if (!process.env.WINDOWS_CERTIFICATE_PASSWORD?.trim()) {
    console.error("WINDOWS_CERTIFICATE_PASSWORD is required when Windows signing is enabled.");
    process.exit(1);
  }

  return {
    enabled: true,
    scriptPath: path.join(desktopRoot, "scripts", "sign-windows-artifact.ps1"),
  };
}

function parseUpdaterEndpointValues(value) {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseUpdaterEndpoint(value) {
  const endpoint = parseProductionUrl(value);

  if (isLoopbackHost(endpoint.hostname) || endpoint.hostname === "whispr.invalid") {
    console.error("Desktop updater endpoints must not point to localhost or whispr.invalid.");
    process.exit(1);
  }

  if (!endpoint.pathname.endsWith(".json")) {
    console.error("Desktop updater endpoints must point to an HTTPS latest.json manifest.");
    process.exit(1);
  }

  return endpoint;
}

function parseUpdaterReleaseRing(value) {
  const ring = value.trim() || "uat";

  if (!updaterReleaseRings.has(ring)) {
    console.error(
      `WHISPR_DESKTOP_RELEASE_RING must be one of: ${Array.from(updaterReleaseRings).join(", ")}.`,
    );
    process.exit(1);
  }

  return ring;
}

function parseUrl(value, name) {
  let url;

  try {
    url = new URL(value);
  } catch {
    console.error(`${name} must be a valid URL.`);
    process.exit(1);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    console.error(`${name} must use http or https.`);
    process.exit(1);
  }

  if (name === "TAURI_DEV_WEB_URL" && url.protocol !== "http:") {
    console.error("TAURI_DEV_WEB_URL must use http for local development.");
    process.exit(1);
  }

  if (name === "TAURI_DEV_WEB_URL" && !isLoopbackHost(url.hostname)) {
    console.error("TAURI_DEV_WEB_URL must point to localhost or 127.0.0.1.");
    process.exit(1);
  }

  return url;
}

function originPattern(url) {
  return `${url.protocol}//${url.host}`;
}

function websocketOriginPattern(url) {
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${url.host}`;
}

function capabilityUrlPatterns(url) {
  const origin = originPattern(url);
  return [origin, `${origin}/*`];
}

function buildDesktopCsp(webUrl, mode) {
  const connectSources = new Set([
    "'self'",
    originPattern(webUrl),
    websocketOriginPattern(webUrl),
    "https://api.giphy.com",
    "https://*.giphy.com",
    "https://*.livekit.cloud",
    "https://livekit.io",
    "https://integrations.livekit.io",
    "https://*.ufs.sh",
    "https://*.uploadthing.com",
    "https://challenges.cloudflare.com",
    "wss://*.livekit.cloud",
  ]);

  if (mode === "dev") {
    connectSources.add("http://localhost:*");
    connectSources.add("http://127.0.0.1:*");
    connectSources.add("ws://localhost:*");
    connectSources.add("ws://127.0.0.1:*");
  }

  const directives = {
    "base-uri": ["'self'"],
    "connect-src": [...connectSources],
    "default-src": ["'self'"],
    "font-src": ["'self'", "data:"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'self'", "https://challenges.cloudflare.com"],
    "img-src": [
      "'self'",
      "blob:",
      "data:",
      "https://*.giphy.com",
      "https://*.googleusercontent.com",
      "https://*.ufs.sh",
      "https://*.uploadthing.com",
      "https://avatars.githubusercontent.com",
      "https://media*.giphy.com",
    ],
    "media-src": ["'self'", "blob:", "data:", "https://*.ufs.sh", "https://*.uploadthing.com"],
    "object-src": ["'none'"],
    "script-src": ["'self'", "'wasm-unsafe-eval'", "blob:", "https://challenges.cloudflare.com"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "worker-src": ["'self'", "blob:"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

function isLoopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
}

function isEnabledValue(value) {
  return value === "1" || value === "true";
}

function withRustupPath(currentPath = "") {
  if (process.platform !== "win32") {
    return currentPath;
  }

  const cargoBin = path.join(process.env.USERPROFILE || "", ".cargo", "bin");

  if (!cargoBin || currentPath.toLowerCase().split(";").includes(cargoBin.toLowerCase())) {
    return currentPath;
  }

  return `${cargoBin};${currentPath}`;
}
