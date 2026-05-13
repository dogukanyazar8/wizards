import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const scriptPath = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");
const generatedDir = path.join(desktopRoot, ".tauri", "generated");
const generatedConfigPath = path.join(generatedDir, "tauri.conf.generated.json");
const defaultProductionWebUrl = "https://whispr.team";

const command = process.argv[2];
const extraArgs = process.argv.slice(3);
const writeConfigOnly = extraArgs.includes("--write-config-only");
const unknownArgs = extraArgs.filter((arg) => arg !== "--write-config-only");

if (!["dev", "build"].includes(command) || unknownArgs.length > 0) {
  console.error("Usage: node ./scripts/run-tauri.mjs <dev|build> [--write-config-only]");
  process.exit(1);
}

const appName = process.env.TAURI_APP_NAME || "Whispr";
const devUrl = parseUrl(
  process.env.TAURI_DEV_WEB_URL || "http://localhost:3000",
  "TAURI_DEV_WEB_URL",
);
const webUrl =
  command === "dev"
    ? devUrl
    : parseProductionUrl(process.env.TAURI_WEB_URL || defaultProductionWebUrl);
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
const nativeUxPermissions = [
  "notification:allow-is-permission-granted",
  "notification:allow-notify",
  "notification:allow-request-permission",
  "core:window:allow-close",
  "core:window:allow-internal-toggle-maximize",
  "core:window:allow-minimize",
  "core:window:allow-start-dragging",
  "core:window:allow-toggle-maximize",
];
const desktopCsp = buildDesktopCsp(webUrl, command);
const tauriEnv = {
  ...process.env,
  PATH: withRustupPath(process.env.PATH),
  WHISPR_DESKTOP_APP_NAME: appName,
  WHISPR_DESKTOP_WEB_URL: webUrl.href,
};

await mkdir(generatedDir, { recursive: true });

await writeFile(
  generatedConfigPath,
  `${JSON.stringify(
    {
      productName: appName,
      build: {
        devUrl: devUrl.href,
        frontendDist: webUrl.href,
      },
      app: {
        withGlobalTauri: false,
        windows: [],
        security: {
          csp: desktopCsp,
          capabilities: [
            {
              identifier: "whispr-desktop-native-ux",
              description:
                "Whispr remote web content receives only the minimal Tauri permissions required for native desktop UX.",
              windows: ["main"],
              remote: {
                urls: capabilityUrls,
              },
              permissions: nativeUxPermissions,
            },
          ],
        },
      },
      plugins: {
        "deep-link": {
          desktop: {
            schemes: ["whispr"],
          },
        },
      },
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

if (writeConfigOnly) {
  console.log("[Whispr Desktop] config-only mode: skipping Tauri CLI invocation");
  process.exit(0);
}

const child = spawn(
  process.execPath,
  [require.resolve("@tauri-apps/cli/tauri.js"), command, "--config", generatedConfigPath],
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

function capabilityUrlPatterns(url) {
  const origin = originPattern(url);
  return [origin, `${origin}/*`];
}

function buildDesktopCsp(webUrl, mode) {
  const connectSources = new Set([
    "'self'",
    originPattern(webUrl),
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
