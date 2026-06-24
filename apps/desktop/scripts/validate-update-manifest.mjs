import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDesktopVersionContract } from "./release-ops.mjs";

const SUPPORTED_PLATFORMS = Object.freeze(["windows-x86_64"]);
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const DEFAULT_REMOTE_TIMEOUT_MS = 8_000;
const DESKTOP_RELEASE_RINGS = Object.freeze(["uat", "canary", "stable"]);
const DESKTOP_RELEASE_RING_SET = new Set(DESKTOP_RELEASE_RINGS);

export function validateDesktopUpdateManifest(manifest, options = {}) {
  const platform = options.platform || "windows-x86_64";
  const expectedVersion = options.expectedVersion || getDesktopVersionContract().desktopNativeVersion;
  const expectedReleaseTag = options.expectedReleaseTag;
  const expectedRing = options.expectedRing;
  const expectedSignature = options.expectedSignature;
  const expectedArtifactPath = options.artifactPath ? assertExistingFile(options.artifactPath, "artifact") : null;

  assertPlainObject(manifest, "Updater manifest");
  assertSupportedPlatform(platform);
  assertSemver(manifest.version, "Updater manifest version");
  assertSemver(expectedVersion, "Expected updater version");

  if (manifest.version !== expectedVersion) {
    throw new Error(
      `Updater manifest version (${manifest.version}) does not match expected version (${expectedVersion}).`,
    );
  }

  if (typeof manifest.notes !== "string") {
    throw new Error("Updater manifest notes must be a string.");
  }

  assertValidDate(manifest.pub_date, "Updater manifest pub_date");
  assertPlainObject(manifest.platforms, "Updater manifest platforms");

  const platformEntry = manifest.platforms[platform];
  assertPlainObject(platformEntry, `Updater manifest platform entry (${platform})`);

  const signature = normalizeSignature(platformEntry.signature);
  if (expectedSignature !== undefined && signature !== normalizeSignature(expectedSignature)) {
    throw new Error("Updater manifest signature does not match the expected .sig file content.");
  }

  const artifactUrl = assertSafeHttpsUrl(platformEntry.url, "Updater artifact URL");
  if (platform === "windows-x86_64" && !artifactUrl.pathname.endsWith(".exe")) {
    throw new Error("windows-x86_64 updater artifact URL must point to an NSIS .exe installer.");
  }

  assertImmutableReleaseArtifactUrl(artifactUrl, {
    expectedReleaseTag,
    expectedRing,
  });

  if (expectedArtifactPath) {
    const artifactName = path.basename(expectedArtifactPath);
    const urlArtifactName = path.basename(decodeURIComponent(artifactUrl.pathname));

    if (artifactName !== urlArtifactName) {
      throw new Error(
        `Updater artifact filename mismatch: manifest has ${urlArtifactName}, local artifact is ${artifactName}.`,
      );
    }
  }

  return {
    artifactUrl: artifactUrl.href,
    platform,
    signature,
    version: manifest.version,
  };
}

export async function readDesktopUpdateManifest(manifestSource) {
  const source = String(manifestSource || "");

  if (!source) {
    throw new Error("--manifest is required.");
  }

  if (/^https?:\/\//i.test(source)) {
    const manifestUrl = assertSafeHttpsUrl(source, "Updater manifest URL");

    if (!manifestUrl.pathname.endsWith(".json")) {
      throw new Error("Remote updater manifest URL must point to a .json file.");
    }

    const response = await fetchWithTimeout(manifestUrl.href, {
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Updater manifest fetch failed with HTTP ${response.status}.`);
    }

    return {
      manifest: await response.json(),
      source: manifestUrl.href,
    };
  }

  const manifestPath = assertExistingFile(source, "manifest");
  const manifest = parseJsonText(await readFile(manifestPath, "utf8"));

  return {
    manifest,
    source: manifestPath,
  };
}

export async function validateDesktopUpdateManifestSource(options) {
  const { manifest, source } = await readDesktopUpdateManifest(options.manifestSource);
  const expectedSignature =
    options.signaturePath === undefined
      ? undefined
      : await readFile(assertExistingFile(options.signaturePath, "signature"), "utf8");
  const result = validateDesktopUpdateManifest(manifest, {
    artifactPath: options.artifactPath,
    expectedReleaseTag: options.expectedReleaseTag,
    expectedRing: options.expectedRing,
    expectedSignature,
    expectedVersion: options.expectedVersion,
    platform: options.platform,
  });

  if (options.checkArtifactUrl) {
    await assertRemoteArtifactAvailable(result.artifactUrl);
  }

  return {
    ...result,
    source,
  };
}

export function parseValidationCliArgs(argv) {
  const values = new Map();
  const allowed = new Set([
    "artifact",
    "check-artifact-url",
    "expected-version",
    "manifest",
    "platform",
    "release-tag",
    "ring",
    "signature",
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

    if (rawKey === "check-artifact-url") {
      values.set(rawKey, "true");
      continue;
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

  if (!values.has("manifest")) {
    throw new Error("Missing required option: --manifest");
  }

  return {
    artifactPath: values.get("artifact"),
    checkArtifactUrl: values.get("check-artifact-url") === "true",
    expectedReleaseTag: values.get("release-tag"),
    expectedRing: values.get("ring"),
    expectedVersion: values.get("expected-version"),
    manifestSource: values.get("manifest"),
    platform: values.get("platform"),
    signaturePath: values.get("signature"),
  };
}

async function assertRemoteArtifactAvailable(artifactUrl) {
  const response = await fetchWithTimeout(artifactUrl, {
    method: "HEAD",
  });

  if (!response.ok) {
    throw new Error(`Updater artifact availability check failed with HTTP ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 0 && contentLength < 1024 * 1024) {
    throw new Error("Updater artifact looks too small to be a valid desktop installer.");
  }
}

async function fetchWithTimeout(url, init = {}) {
  const signal = AbortSignal.timeout(DEFAULT_REMOTE_TIMEOUT_MS);

  return fetch(url, {
    ...init,
    signal,
  });
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function parseJsonText(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/, ""));
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

function assertSemver(value, label) {
  const version = String(value || "");

  if (version.startsWith("v")) {
    throw new Error(`${label} must not include a leading v.`);
  }

  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`${label} (${version}) must be semver-like.`);
  }
}

function assertValidDate(value, label) {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${label} must be a valid ISO date string.`);
  }
}

function normalizeSignature(signatureText) {
  const signature = String(signatureText || "").trim();

  if (!signature) {
    throw new Error("Updater manifest signature is empty.");
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(signature)) {
    throw new Error("Updater manifest signature contains invalid control characters.");
  }

  return signature;
}

function assertSafeHttpsUrl(value, label) {
  let url;

  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS.`);
  }

  if (isLoopbackHost(url.hostname) || url.hostname === "whispr.invalid") {
    throw new Error(`${label} must not point to localhost or whispr.invalid.`);
  }

  return url;
}

function assertImmutableReleaseArtifactUrl(url, options = {}) {
  const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const filename = segments.at(-1) || "";
  const desktopIndex = segments.findIndex(
    (segment, index) => segment === "desktop" && DESKTOP_RELEASE_RING_SET.has(segments[index + 1]),
  );
  const expectedRing = options.expectedRing ? normalizeReleaseRing(options.expectedRing) : null;
  const expectedReleaseTag = options.expectedReleaseTag ? normalizeReleaseTag(options.expectedReleaseTag) : null;

  if (desktopIndex === -1) {
    if (expectedRing || expectedReleaseTag) {
      throw new Error("Updater artifact URL must include desktop/<ring>/releases/<release-tag>/ path segments.");
    }

    return;
  }

  const ring = segments[desktopIndex + 1];
  const releasesSegment = segments[desktopIndex + 2];
  const releaseTag = segments[desktopIndex + 3];
  const releaseFilename = segments[desktopIndex + 4];

  if (expectedRing && ring !== expectedRing) {
    throw new Error(`Updater artifact URL release ring (${ring}) does not match expected ${expectedRing}.`);
  }

  if (releasesSegment !== "releases" || !releaseTag) {
    throw new Error(
      "Updater artifact URL must use an immutable release path: desktop/<ring>/releases/<release-tag>/<installer>.",
    );
  }

  if (expectedReleaseTag && releaseTag !== expectedReleaseTag) {
    throw new Error(`Updater artifact URL release tag (${releaseTag}) does not match expected ${expectedReleaseTag}.`);
  }

  if (releaseFilename !== filename || segments.length !== desktopIndex + 5) {
    throw new Error("Updater artifact URL must place the installer directly under its immutable release tag directory.");
  }
}

function normalizeReleaseRing(value) {
  const ring = String(value || "").trim();

  if (!DESKTOP_RELEASE_RING_SET.has(ring)) {
    throw new Error(`Updater artifact release ring must be one of: ${DESKTOP_RELEASE_RINGS.join(", ")}.`);
  }

  return ring;
}

function normalizeReleaseTag(value) {
  const releaseTag = String(value || "").trim();

  if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?(?:-(?:uat|canary)\.[1-9]\d*)?$/.test(releaseTag)) {
    throw new Error("Updater artifact release tag must be a valid desktop release tag.");
  }

  return releaseTag;
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseValidationCliArgs(process.argv.slice(2));
    const result = await validateDesktopUpdateManifestSource(options);

    console.log(`[Whispr Desktop] update manifest source: ${result.source}`);
    console.log(`[Whispr Desktop] version: ${result.version}`);
    console.log(`[Whispr Desktop] platform: ${result.platform}`);
    console.log(`[Whispr Desktop] artifact URL: ${result.artifactUrl}`);
    console.log("[Whispr Desktop] update manifest validation passed");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
