import { existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DESKTOP_RELEASE_WORKFLOW_RINGS } from "./desktop-release-workflow.mjs";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const SAFE_ARTIFACT_NAME_PATTERN = /^[0-9A-Za-z._-]+$/;
const FORBIDDEN_SENSITIVE_MARKERS = Object.freeze([
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "WINDOWS_CERTIFICATE_PASSWORD",
  "WINDOWS_CERTIFICATE_PFX_BASE64",
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "PRIVATE KEY",
]);

export function createDesktopReleasePublishPlan(options = {}) {
  const ring = normalizeRing(options.ring || "uat");
  const version = normalizeVersion(options.version);
  const releaseTag = normalizeReleaseTag(options.releaseTag, { ring, version });
  const publishR2 = parseBoolean(options.publishR2, false, "publish-r2");
  const publishGithubRelease = parseBoolean(
    options.publishGithubRelease,
    false,
    "publish-github-release",
  );

  if (!publishR2 && !publishGithubRelease) {
    throw new Error("Desktop publish plan requires at least one publish target.");
  }

  if (publishGithubRelease && !publishR2) {
    throw new Error("Desktop GitHub Release publishing requires publish_r2=true so manifest evidence exists.");
  }

  const installer = describeInputFile(options.installerPath, "installer");
  const manifest = describeInputFile(options.manifestPath, "manifest");
  const signature = describeInputFile(options.signaturePath, "signature");
  const metadata = describeInputFile(options.metadataPath, "metadata");
  const audit = describeInputFile(options.auditPath, "audit");
  const promotionJson = describeInputFile(options.promotionJsonPath, "promotion JSON");
  const promotionMarkdown = describeInputFile(options.promotionMarkdownPath, "promotion Markdown");
  const updaterBaseUrl = normalizeUpdaterBaseUrl(options.updaterBaseUrl, ring);
  const updaterManifestUrl = new URL("latest.json", ensureTrailingSlash(updaterBaseUrl.href)).href;

  assertInstallerMatchesVersion(installer.filename, version);
  assertManifestFilename(manifest.filename);
  assertSignatureMatchesInstaller(signature.filename, installer.filename);

  const r2Prefix = `desktop/${ring}`;
  const githubAssets = [
    installer,
    manifest,
    signature,
    metadata,
    audit,
    promotionJson,
    promotionMarkdown,
  ];

  const plan = {
    generatedAt: new Date().toISOString(),
    githubRelease: publishGithubRelease
      ? {
          assets: githubAssets.map((asset) => asset.filename),
          prerelease: ring !== "stable",
          releaseTag,
          title: `Whispr Desktop ${version}${ring === "stable" ? "" : ` ${ring.toUpperCase()}`}`,
        }
      : null,
    r2: publishR2
      ? {
          endpoint: updaterBaseUrl.origin,
          manifestUrl: updaterManifestUrl,
          uploads: [
            {
              cacheControl: "public, max-age=31536000, immutable",
              contentType: "application/vnd.microsoft.portable-executable",
              fileName: installer.filename,
              key: `${r2Prefix}/${installer.filename}`,
            },
            {
              cacheControl: "no-cache, no-store, must-revalidate",
              contentType: "application/json",
              fileName: manifest.filename,
              key: `${r2Prefix}/latest.json`,
            },
            {
              cacheControl: "public, max-age=31536000, immutable",
              contentType: "text/plain; charset=utf-8",
              fileName: signature.filename,
              key: `${r2Prefix}/${signature.filename}`,
            },
          ],
        }
      : null,
    release: {
      ring,
      version,
      webUrl: options.webUrl ? normalizeWebUrl(options.webUrl).href : null,
    },
  };

  assertNoSensitiveValues(plan);

  return plan;
}

export function parseDesktopPublishPlanCliArgs(argv) {
  const values = new Map();
  const allowed = new Set([
    "artifact",
    "audit",
    "manifest",
    "metadata",
    "out",
    "promotion-json",
    "promotion-md",
    "publish-github-release",
    "publish-r2",
    "release-tag",
    "ring",
    "signature",
    "updater-base-url",
    "version",
    "web-url",
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
    if (value === undefined || String(value).startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    values.set(rawKey, value);
  }

  return {
    auditPath: values.get("audit"),
    installerPath: values.get("artifact"),
    manifestPath: values.get("manifest"),
    metadataPath: values.get("metadata"),
    outputPath: values.get("out"),
    promotionJsonPath: values.get("promotion-json"),
    promotionMarkdownPath: values.get("promotion-md"),
    publishGithubRelease: values.get("publish-github-release"),
    publishR2: values.get("publish-r2"),
    releaseTag: values.get("release-tag"),
    ring: values.get("ring"),
    signaturePath: values.get("signature"),
    updaterBaseUrl: values.get("updater-base-url"),
    version: values.get("version"),
    webUrl: values.get("web-url"),
  };
}

function describeInputFile(filePath, label) {
  const resolvedPath = path.resolve(String(filePath || ""));

  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    throw new Error(`Desktop publish ${label} file does not exist: ${resolvedPath}`);
  }

  const filename = path.basename(resolvedPath);
  if (!SAFE_ARTIFACT_NAME_PATTERN.test(filename)) {
    throw new Error(
      `Desktop publish ${label} filename (${filename}) may only contain letters, numbers, dots, underscores, and hyphens.`,
    );
  }

  if (statSync(resolvedPath).size <= 0) {
    throw new Error(`Desktop publish ${label} file is empty: ${filename}`);
  }

  return {
    filename,
  };
}

function normalizeRing(value) {
  const ring = String(value || "").trim();

  if (!DESKTOP_RELEASE_WORKFLOW_RINGS.includes(ring)) {
    throw new Error(
      `Desktop publish ring must be one of: ${DESKTOP_RELEASE_WORKFLOW_RINGS.join(", ")}.`,
    );
  }

  return ring;
}

function normalizeVersion(value) {
  const version = String(value || "").trim();

  if (!version) {
    throw new Error("Desktop publish version is required.");
  }

  if (version.startsWith("v")) {
    throw new Error("Desktop publish version must not include a leading v.");
  }

  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Desktop publish version (${version}) must be semver-like.`);
  }

  return version;
}

function normalizeReleaseTag(value, { ring, version }) {
  const releaseTag = String(value || "").trim();

  if (!releaseTag) {
    throw new Error("Desktop publish release tag is required.");
  }

  if (ring === "stable" && releaseTag !== `v${version}`) {
    throw new Error(`Stable desktop release tag must be v${version}.`);
  }

  if (ring !== "stable" && !releaseTag.startsWith(`v${version}-${ring}.`)) {
    throw new Error(`Non-stable desktop release tag must start with v${version}-${ring}.`);
  }

  return releaseTag;
}

function normalizeUpdaterBaseUrl(value, ring) {
  let url;

  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("Desktop publish updater base URL must be a valid HTTPS URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Desktop publish updater base URL must use HTTPS.");
  }

  if (isLoopbackHost(url.hostname) || url.hostname === "whispr.invalid") {
    throw new Error("Desktop publish updater base URL must not point to localhost or whispr.invalid.");
  }

  if (url.pathname.endsWith(".json")) {
    throw new Error("Desktop publish updater base URL must be an artifact directory, not latest.json.");
  }

  const pathSegments = url.pathname.split("/").filter(Boolean);
  if (!pathSegments.includes(ring)) {
    throw new Error(`Desktop publish updater base URL path must include the release ring segment (${ring}).`);
  }

  url.hash = "";
  url.search = "";

  return new URL(ensureTrailingSlash(url.href));
}

function normalizeWebUrl(value) {
  let url;

  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("Desktop publish web URL must be a valid HTTPS URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Desktop publish web URL must use HTTPS.");
  }

  if (isLoopbackHost(url.hostname) || url.hostname === "whispr.invalid") {
    throw new Error("Desktop publish web URL must not point to localhost or whispr.invalid.");
  }

  url.hash = "";
  url.search = "";

  return url;
}

function assertInstallerMatchesVersion(filename, version) {
  if (!filename.endsWith(".exe") || !filename.includes(version) || !/setup/i.test(filename)) {
    throw new Error(`Desktop publish installer filename must be a setup .exe for version ${version}.`);
  }
}

function assertManifestFilename(filename) {
  if (filename !== "latest.json") {
    throw new Error("Desktop publish manifest filename must be latest.json.");
  }
}

function assertSignatureMatchesInstaller(signatureName, installerName) {
  if (signatureName !== `${installerName}.sig`) {
    throw new Error("Desktop publish signature filename must match <installer>.sig.");
  }
}

function parseBoolean(value, defaultValue, label) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  throw new Error(`${label} must be true or false.`);
}

function assertNoSensitiveValues(value) {
  const serialized = JSON.stringify(value);

  for (const forbidden of FORBIDDEN_SENSITIVE_MARKERS) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Desktop publish plan contains sensitive marker: ${forbidden}.`);
    }
  }
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseDesktopPublishPlanCliArgs(process.argv.slice(2));
    const plan = createDesktopReleasePublishPlan(options);

    if (options.outputPath) {
      await writeFile(path.resolve(options.outputPath), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    }

    console.log(JSON.stringify(plan, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
