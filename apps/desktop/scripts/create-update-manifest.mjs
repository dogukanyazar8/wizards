import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDesktopVersionContract } from "./release-ops.mjs";

const SUPPORTED_PLATFORMS = Object.freeze(["windows-x86_64"]);
const SAFE_ARTIFACT_NAME_PATTERN = /^[0-9A-Za-z._-]+$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export function createDesktopUpdateManifest(options) {
  const artifactPath = assertExistingFile(options.artifactPath, "artifact");
  const signaturePath = assertExistingFile(options.signaturePath, "signature");
  const platform = options.platform || "windows-x86_64";
  const version = options.version || getDesktopVersionContract().desktopNativeVersion;
  const pubDate = normalizePubDate(options.pubDate);
  const notes = String(options.notes || "");
  const signature = normalizeSignature(options.signature ?? options.signatureText);
  const artifactName = path.basename(artifactPath);
  const url = resolveArtifactUrl(options.baseUrl, artifactName).href;

  assertSupportedPlatform(platform);
  assertSemver(version);
  assertWindowsArtifact(platform, artifactName);

  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      [platform]: {
        signature,
        url,
      },
    },
    artifactPath,
    signaturePath,
  };
}

export async function createDesktopUpdateManifestFromFiles(options) {
  const signatureText = await readFile(assertExistingFile(options.signaturePath, "signature"), "utf8");

  return createDesktopUpdateManifest({
    ...options,
    signatureText,
  });
}

export async function writeDesktopUpdateManifest(options) {
  const manifest = await createDesktopUpdateManifestFromFiles(options);
  const outputPath = path.resolve(options.outputPath || path.join(path.dirname(manifest.artifactPath), "latest.json"));
  const serializableManifest = stripInternalManifestFields(manifest);

  await writeFile(outputPath, `${JSON.stringify(serializableManifest, null, 2)}\n`, "utf8");

  return {
    manifest: serializableManifest,
    outputPath,
  };
}

export function parseManifestCliArgs(argv) {
  const values = new Map();
  const allowed = new Set([
    "artifact",
    "base-url",
    "notes",
    "out",
    "platform",
    "pub-date",
    "signature",
    "version",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    const rawArg = arg.slice(2);
    const equalsIndex = rawArg.indexOf("=");
    const rawKey = equalsIndex === -1 ? rawArg : rawArg.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : rawArg.slice(equalsIndex + 1);
    if (!allowed.has(rawKey)) {
      throw new Error(`Unknown option: --${rawKey}`);
    }

    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    values.set(rawKey, value);
  }

  for (const required of ["artifact", "signature", "base-url"]) {
    if (!values.has(required)) {
      throw new Error(`Missing required option: --${required}`);
    }
  }

  return {
    artifactPath: values.get("artifact"),
    baseUrl: values.get("base-url"),
    notes: values.get("notes"),
    outputPath: values.get("out"),
    platform: values.get("platform"),
    pubDate: values.get("pub-date"),
    signaturePath: values.get("signature"),
    version: values.get("version"),
  };
}

export function stripInternalManifestFields(manifest) {
  return {
    version: manifest.version,
    notes: manifest.notes,
    pub_date: manifest.pub_date,
    platforms: manifest.platforms,
  };
}

export function resolveArtifactUrl(baseUrlValue, artifactName) {
  if (!SAFE_ARTIFACT_NAME_PATTERN.test(artifactName)) {
    throw new Error(
      `Artifact filename (${artifactName}) may only contain letters, numbers, dots, underscores, and hyphens.`,
    );
  }

  const baseUrl = parseManifestBaseUrl(baseUrlValue);

  return new URL(artifactName, ensureTrailingSlash(baseUrl.href));
}

function parseManifestBaseUrl(value) {
  let url;

  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("--base-url must be a valid HTTPS URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("--base-url must use HTTPS.");
  }

  if (isLoopbackHost(url.hostname) || url.hostname === "whispr.invalid") {
    throw new Error("--base-url must not point to localhost or whispr.invalid.");
  }

  if (url.pathname.endsWith(".json")) {
    throw new Error("--base-url must be an update artifact directory, not a latest.json endpoint.");
  }

  return url;
}

function assertExistingFile(filePath, label) {
  const resolvedPath = path.resolve(String(filePath || ""));

  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    throw new Error(`Desktop update ${label} file does not exist: ${resolvedPath}`);
  }

  return resolvedPath;
}

function assertSupportedPlatform(platform) {
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported updater platform (${platform}). Supported platforms: ${SUPPORTED_PLATFORMS.join(", ")}.`);
  }
}

function assertSemver(version) {
  if (String(version).startsWith("v")) {
    throw new Error("Updater manifest version must not include a leading v.");
  }

  if (!SEMVER_PATTERN.test(String(version))) {
    throw new Error(`Updater manifest version (${version}) must be semver-like.`);
  }
}

function assertWindowsArtifact(platform, artifactName) {
  if (platform === "windows-x86_64" && !artifactName.endsWith(".exe")) {
    throw new Error("windows-x86_64 updater artifacts must be NSIS .exe installers.");
  }
}

function normalizeSignature(signatureText) {
  const signature = String(signatureText || "").trim();

  if (!signature) {
    throw new Error("Desktop update signature is empty.");
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(signature)) {
    throw new Error("Desktop update signature contains invalid control characters.");
  }

  return signature;
}

function normalizePubDate(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("--pub-date must be a valid date.");
  }

  return date.toISOString();
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseManifestCliArgs(process.argv.slice(2));
    const result = await writeDesktopUpdateManifest(options);
    const [[platform, entry]] = Object.entries(result.manifest.platforms);

    console.log(`[Whispr Desktop] update manifest: ${result.outputPath}`);
    console.log(`[Whispr Desktop] version: ${result.manifest.version}`);
    console.log(`[Whispr Desktop] platform: ${platform}`);
    console.log(`[Whispr Desktop] artifact URL: ${entry.url}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
