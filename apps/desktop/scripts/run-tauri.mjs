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

const command = process.argv[2];

if (!["dev", "build"].includes(command)) {
  console.error("Usage: node ./scripts/run-tauri.mjs <dev|build>");
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
    : parseRequiredProductionUrl(process.env.TAURI_WEB_URL);
const capabilityUrls =
  command === "dev"
    ? Array.from(new Set([originPattern(devUrl), "http://localhost:3000", "http://127.0.0.1:3000"]))
    : [originPattern(webUrl)];
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
          capabilities: [
            {
              identifier: "whispr-desktop-native-ux",
              description:
                "Whispr remote web content receives only the minimal Tauri permissions required for native desktop UX.",
              windows: ["main"],
              remote: {
                urls: capabilityUrls,
              },
              permissions: [
                "notification:allow-is-permission-granted",
                "notification:allow-notify",
                "notification:allow-request-permission",
              ],
            },
          ],
        },
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);

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

function parseRequiredProductionUrl(value) {
  if (!value) {
    console.error("TAURI_WEB_URL is required for production desktop builds.");
    process.exit(1);
  }

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
