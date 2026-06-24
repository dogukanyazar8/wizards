import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertDesktopVersionContract,
  getDesktopVersionContract,
} from "./release-ops.mjs";

export const DESKTOP_RELEASE_WORKFLOW_RINGS = Object.freeze(["uat", "canary", "stable"]);

const DEFAULT_UAT_WEB_URL = "https://wizardsweb-uat.up.railway.app/";
const STABLE_WEB_URL = "https://whispr.team/";
const DEFAULT_UPDATER_BASE_ORIGIN = "https://updates.whispr.team";
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export function createDesktopReleaseWorkflowContract(options = {}) {
  const ring = normalizeRing(options.ring || "uat");
  const version = normalizeVersion(options.version);
  const webUrl = normalizeWebUrl(options.webUrl || defaultWebUrlForRing(ring));
  const publishGithubRelease = parseBoolean(
    options.publishGithubRelease,
    false,
    "publish_github_release",
  );
  const publishR2 = parseBoolean(options.publishR2, false, "publish_r2");
  const enableUpdater = parseBoolean(
    options.enableUpdater,
    publishR2 || publishGithubRelease,
    "enable_updater",
  );
  const confirmStableRelease = parseBoolean(
    options.confirmStableRelease,
    false,
    "confirm_stable_release",
  );
  const refName = String(options.refName || "").trim();
  const releaseSequence = normalizeReleaseSequence(options.releaseSequence, ring);
  const versionContract = assertDesktopVersionContract(getDesktopVersionContract(options.projectRoot));
  const tagName = buildDesktopReleaseTag({
    releaseSequence,
    ring,
    version,
  });
  const updaterFeedBaseUrl = enableUpdater
    ? normalizeUpdaterBaseUrl(options.updaterBaseUrl || defaultUpdaterFeedBaseUrlForRing(ring), ring)
    : null;
  const updaterArtifactBaseUrl = updaterFeedBaseUrl
    ? buildReleaseArtifactBaseUrl(updaterFeedBaseUrl, tagName)
    : null;

  if (version !== versionContract.desktopNativeVersion) {
    throw new Error(
      `Desktop release version (${version}) must match desktop native version (${versionContract.desktopNativeVersion}).`,
    );
  }

  if (ring === "stable") {
    assertStableReleaseGuard({
      confirmStableRelease,
      refName,
      version,
      webUrl,
    });
  }

  if (publishR2 && !enableUpdater) {
    throw new Error("Desktop R2 publishing requires enable_updater=true so signed manifest evidence exists.");
  }

  if (publishGithubRelease && !publishR2) {
    throw new Error("Desktop GitHub Release publishing requires publish_r2=true so remote updater evidence exists.");
  }

  if (publishGithubRelease && !enableUpdater) {
    throw new Error("Desktop GitHub Release publishing requires enable_updater=true so signed manifest evidence exists.");
  }

  return {
    github: {
      refName,
    },
    prerelease: ring !== "stable",
    publish: {
      githubRelease: publishGithubRelease,
      r2: publishR2,
    },
    releaseRing: ring,
    releaseStrategy: releaseStrategyForRing(ring),
    releaseTag: tagName,
    stableGuard: {
      confirmed: confirmStableRelease,
      requiredRef: ring === "stable" ? "main" : null,
    },
    updater: {
      enabled: enableUpdater,
      artifactBaseUrl: updaterArtifactBaseUrl ? updaterArtifactBaseUrl.href : null,
      feedBaseUrl: updaterFeedBaseUrl ? updaterFeedBaseUrl.href : null,
      manifestUrl: updaterFeedBaseUrl
        ? new URL("latest.json", ensureTrailingSlash(updaterFeedBaseUrl.href)).href
        : null,
    },
    version,
    versionContract,
    webUrl: webUrl.href,
  };
}

export function parseDesktopReleaseWorkflowCliArgs(argv) {
  const values = new Map();
  const allowed = new Set([
    "confirm-stable-release",
    "enable-updater",
    "out",
    "project-root",
    "publish-github-release",
    "publish-r2",
    "ref-name",
    "release-sequence",
    "ring",
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
    confirmStableRelease: values.get("confirm-stable-release"),
    enableUpdater: values.get("enable-updater"),
    outputPath: values.get("out"),
    projectRoot: values.get("project-root")
      ? path.resolve(values.get("project-root"))
      : undefined,
    publishGithubRelease: values.get("publish-github-release"),
    publishR2: values.get("publish-r2"),
    refName: values.get("ref-name"),
    releaseSequence: values.get("release-sequence"),
    ring: values.get("ring"),
    updaterBaseUrl: values.get("updater-base-url"),
    version: values.get("version"),
    webUrl: values.get("web-url"),
  };
}

export function buildDesktopReleaseTag({ releaseSequence, ring, version }) {
  if (ring === "stable") {
    return `v${version}`;
  }

  return `v${version}-${ring}.${releaseSequence}`;
}

function normalizeRing(value) {
  const ring = String(value || "").trim();

  if (!DESKTOP_RELEASE_WORKFLOW_RINGS.includes(ring)) {
    throw new Error(
      `Desktop release ring must be one of: ${DESKTOP_RELEASE_WORKFLOW_RINGS.join(", ")}.`,
    );
  }

  return ring;
}

function normalizeVersion(value) {
  const version = String(value || "").trim();

  if (!version) {
    throw new Error("Desktop release version is required.");
  }

  if (version.startsWith("v")) {
    throw new Error("Desktop release version must not include a leading v.");
  }

  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Desktop release version (${version}) must be semver-like.`);
  }

  return version;
}

function normalizeWebUrl(value) {
  let url;

  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("Desktop release web_url must be a valid HTTPS URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Desktop release web_url must use HTTPS.");
  }

  if (isLoopbackHost(url.hostname) || url.hostname === "whispr.invalid") {
    throw new Error("Desktop release web_url must not point to localhost or whispr.invalid.");
  }

  url.hash = "";
  url.search = "";

  return url;
}

function normalizeUpdaterBaseUrl(value, ring) {
  let url;

  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("Desktop updater_base_url must be a valid HTTPS URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Desktop updater_base_url must use HTTPS.");
  }

  if (isLoopbackHost(url.hostname) || url.hostname === "whispr.invalid") {
    throw new Error("Desktop updater_base_url must not point to localhost or whispr.invalid.");
  }

  if (url.pathname.endsWith(".json")) {
    throw new Error("Desktop updater_base_url must be the updater feed directory, not latest.json.");
  }

  const pathSegments = url.pathname.split("/").filter(Boolean);
  if (!pathSegments.includes(ring)) {
    throw new Error(`Desktop updater_base_url path must include the release ring segment (${ring}).`);
  }

  url.hash = "";
  url.search = "";

  return new URL(ensureTrailingSlash(url.href));
}

function normalizeReleaseSequence(value, ring) {
  if (ring === "stable") {
    return null;
  }

  const sequence = String(value || "").trim();

  if (!/^[1-9]\d*$/.test(sequence)) {
    throw new Error("Non-stable desktop releases require a positive release sequence.");
  }

  return sequence;
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

function assertStableReleaseGuard({ confirmStableRelease, refName, version, webUrl }) {
  if (!confirmStableRelease) {
    throw new Error("Stable desktop releases require confirm_stable_release=true.");
  }

  if (refName !== "main") {
    throw new Error("Stable desktop releases must be dispatched from the main branch.");
  }

  if (version.includes("-") || version.includes("+")) {
    throw new Error("Stable desktop releases must use a clean semver version.");
  }

  if (webUrl.href !== STABLE_WEB_URL) {
    throw new Error(`Stable desktop releases must use ${STABLE_WEB_URL} as web_url.`);
  }
}

function defaultWebUrlForRing(ring) {
  return ring === "stable" ? STABLE_WEB_URL : DEFAULT_UAT_WEB_URL;
}

function defaultUpdaterFeedBaseUrlForRing(ring) {
  return `${DEFAULT_UPDATER_BASE_ORIGIN}/desktop/${ring}/`;
}

function buildReleaseArtifactBaseUrl(feedBaseUrl, releaseTag) {
  return new URL(`releases/${releaseTag}/`, ensureTrailingSlash(feedBaseUrl.href));
}

function releaseStrategyForRing(ring) {
  if (ring === "stable") {
    return "stable tags use v<version> and require main branch confirmation";
  }

  return `${ring} tags use v<version>-${ring}.<run-number>`;
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

async function writeGithubOutputs(contract) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  const outputs = [
    ["is_prerelease", String(contract.prerelease)],
    ["enable_updater", String(contract.updater.enabled)],
    ["publish_github_release", String(contract.publish.githubRelease)],
    ["publish_r2", String(contract.publish.r2)],
    ["release_ring", contract.releaseRing],
    ["release_tag", contract.releaseTag],
    ["updater_base_url", contract.updater.artifactBaseUrl || ""],
    ["updater_manifest_url", contract.updater.manifestUrl || ""],
    ["version", contract.version],
    ["web_url", contract.webUrl],
  ];

  await appendFile(outputPath, outputs.map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseDesktopReleaseWorkflowCliArgs(process.argv.slice(2));
    const contract = createDesktopReleaseWorkflowContract(options);

    if (options.outputPath) {
      await writeFile(path.resolve(options.outputPath), `${JSON.stringify(contract, null, 2)}\n`, "utf8");
    }

    await writeGithubOutputs(contract);
    console.log(JSON.stringify(contract, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
