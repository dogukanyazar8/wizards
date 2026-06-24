import { createHash } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DESKTOP_RELEASE_RINGS,
  assertDesktopReleaseOpsContract,
  assertDesktopVersionContract,
  getDesktopReleaseOpsContract,
  getDesktopVersionContract,
} from "./release-ops.mjs";
import { validateDesktopUpdateManifestSource } from "./validate-update-manifest.mjs";

export async function createDesktopReleaseAudit(options = {}) {
  const ring = normalizeReleaseRing(options.ring || "uat");
  const versionContract = assertDesktopVersionContract(getDesktopVersionContract());
  const expectedVersion = options.expectedVersion || versionContract.desktopNativeVersion;
  const releaseOpsContract = assertDesktopReleaseOpsContract(getDesktopReleaseOpsContract());
  const checks = [];

  checks.push(passCheck("release_ring", `Release ring is ${ring}.`));
  checks.push(passCheck("version_contract", "Desktop native and web runtime version sources are aligned."));
  checks.push(passCheck("release_ops_contract", "Desktop release operations contract is valid."));

  const artifact = options.artifactPath
    ? await collectArtifactAudit(options.artifactPath)
    : null;
  if (artifact) {
    checks.push(passCheck("artifact_hash", "Local installer artifact hash was calculated with SHA-256."));
  } else {
    checks.push(skipCheck("artifact_hash", "No local artifact was provided."));
  }

  let updaterFeed = null;
  if (options.manifestSource) {
    const result = await validateDesktopUpdateManifestSource({
      artifactPath: options.artifactPath,
      checkArtifactUrl: Boolean(options.checkArtifactUrl),
      expectedReleaseTag: options.releaseTag,
      expectedRing: ring,
      expectedVersion,
      manifestSource: options.manifestSource,
      platform: options.platform,
      signaturePath: options.signaturePath,
    });

    updaterFeed = {
      artifactUrl: result.artifactUrl,
      manifestUrl: options.manifestUrl ? normalizeManifestUrl(options.manifestUrl).href : inferManifestUrl(result.source),
      platform: result.platform,
      signatureVerified: Boolean(options.signaturePath),
      source: sanitizeAuditSource(result.source),
      version: result.version,
    };
    checks.push(
      passCheck(
        "updater_feed_preflight",
        options.checkArtifactUrl
          ? "Updater manifest and remote artifact URL validated."
          : "Updater manifest validated.",
      ),
    );
  } else if (options.requireManifest) {
    throw new Error("Release audit requires --manifest when --require-manifest is set.");
  } else {
    checks.push(skipCheck("updater_feed_preflight", "No updater manifest was provided."));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    ring,
    expectedVersion,
    webUrl: options.webUrl ? normalizeWebUrl(options.webUrl).href : null,
    versionContract,
    platformMatrix: releaseOpsContract.platformMatrix,
    checks,
    artifact,
    updaterFeed,
  };

  assertNoSensitiveValues(report);

  return report;
}

export async function writeDesktopReleaseAudit(options) {
  const report = await createDesktopReleaseAudit(options);
  const outputPath = options.outputPath ? path.resolve(options.outputPath) : null;

  if (outputPath) {
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return {
    outputPath,
    report,
  };
}

export function parseReleaseAuditCliArgs(argv) {
  const values = new Map();
  const allowed = new Set([
    "artifact",
    "check-artifact-url",
    "expected-version",
    "manifest",
    "manifest-url",
    "out",
    "platform",
    "require-manifest",
    "release-tag",
    "ring",
    "signature",
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

    if (rawKey === "check-artifact-url" || rawKey === "require-manifest") {
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

  return {
    artifactPath: values.get("artifact"),
    checkArtifactUrl: values.get("check-artifact-url") === "true",
    expectedVersion: values.get("expected-version"),
    manifestSource: values.get("manifest"),
    manifestUrl: values.get("manifest-url"),
    outputPath: values.get("out"),
    platform: values.get("platform"),
    releaseTag: values.get("release-tag"),
    requireManifest: values.get("require-manifest") === "true",
    ring: values.get("ring"),
    signaturePath: values.get("signature"),
    webUrl: values.get("web-url"),
  };
}

async function collectArtifactAudit(filePath) {
  const resolvedPath = assertExistingFile(filePath, "artifact");
  const stat = statSync(resolvedPath);

  return {
    fileName: path.basename(resolvedPath),
    sha256: await hashFileSha256(resolvedPath),
    sizeBytes: stat.size,
  };
}

function hashFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function normalizeReleaseRing(ring) {
  const value = String(ring || "").trim();

  if (!DESKTOP_RELEASE_RINGS.includes(value)) {
    throw new Error(`Release ring must be one of: ${DESKTOP_RELEASE_RINGS.join(", ")}.`);
  }

  return value;
}

function normalizeWebUrl(value) {
  let url;

  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("--web-url must be a valid HTTPS URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("--web-url must use HTTPS.");
  }

  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "whispr.invalid") {
    throw new Error("--web-url must not point to localhost, 127.0.0.1, or whispr.invalid.");
  }

  return url;
}

function normalizeManifestUrl(value) {
  const url = normalizeWebUrl(value);

  if (!url.pathname.endsWith(".json")) {
    throw new Error("--manifest-url must point to a HTTPS .json updater manifest.");
  }

  return url;
}

function assertExistingFile(filePath, label) {
  const resolvedPath = path.resolve(String(filePath || ""));

  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    throw new Error(`Desktop release ${label} file does not exist: ${resolvedPath}`);
  }

  return resolvedPath;
}

function passCheck(id, detail) {
  return {
    id,
    status: "passed",
    detail,
  };
}

function skipCheck(id, detail) {
  return {
    id,
    status: "skipped",
    detail,
  };
}

function assertNoSensitiveValues(report) {
  const serialized = JSON.stringify(report);

  for (const forbidden of [
    "TAURI_SIGNING_PRIVATE_KEY",
    "WINDOWS_CERTIFICATE_PASSWORD",
    "WINDOWS_CERTIFICATE_PFX_BASE64",
    "PRIVATE KEY",
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Release audit report contains sensitive marker: ${forbidden}`);
    }
  }
}

function sanitizeAuditSource(source) {
  const value = String(source || "");

  if (/^https:\/\//i.test(value)) {
    return value;
  }

  return path.basename(value);
}

function inferManifestUrl(source) {
  const value = String(source || "");

  if (/^https:\/\//i.test(value)) {
    return value;
  }

  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseReleaseAuditCliArgs(process.argv.slice(2));
    const { outputPath, report } = await writeDesktopReleaseAudit(options);

    console.log(`[Whispr Desktop] release audit ring: ${report.ring}`);
    console.log(`[Whispr Desktop] expected version: ${report.expectedVersion}`);
    console.log(
      `[Whispr Desktop] checks: ${report.checks
        .map((check) => `${check.id}:${check.status}`)
        .join(", ")}`,
    );
    if (outputPath) {
      console.log(`[Whispr Desktop] release audit report: ${outputPath}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
