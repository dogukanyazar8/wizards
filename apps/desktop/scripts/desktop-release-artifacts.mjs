import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DESKTOP_RELEASE_WORKFLOW_RINGS } from "./desktop-release-workflow.mjs";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const DEFAULT_ARTIFACT_DIR = path.resolve(
  "apps",
  "desktop",
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis",
);

export async function createDesktopBuildMetadata(options = {}) {
  const artifactDir = path.resolve(options.artifactDir || DEFAULT_ARTIFACT_DIR);
  const version = normalizeVersion(options.version);
  const releaseRing = normalizeRing(options.ring || "uat");
  const updaterEnabled = parseBoolean(options.updaterEnabled, false, "updater-enabled");
  const platform = normalizePlatform(options.platform || "windows-x86_64");

  const artifactNames = await readdir(artifactDir);
  const installerName = selectInstallerName({ artifactNames, version });
  const installerPath = path.join(artifactDir, installerName);
  const signatureName = `${installerName}.sig`;
  const signaturePath = path.join(artifactDir, signatureName);
  const signatureExists = await pathExists(signaturePath);

  if (updaterEnabled && !signatureExists) {
    throw new Error(
      `Updater builds must produce a non-empty signature file next to the installer: ${signatureName}.`,
    );
  }

  const installer = await describeArtifact(installerPath, installerName);
  const signature = signatureExists
    ? await describeArtifact(signaturePath, signatureName)
    : null;

  if (updaterEnabled && (!signature || signature.sizeBytes <= 0)) {
    throw new Error(`Updater signature file is empty: ${signatureName}.`);
  }

  const generatedManifests = [];
  for (const artifactName of artifactNames.filter((name) => name.toLowerCase().endsWith(".json"))) {
    generatedManifests.push(await describeArtifact(path.join(artifactDir, artifactName), artifactName));
  }

  return {
    artifactDirectoryName: path.basename(artifactDir),
    artifacts: {
      generatedManifests,
      installer,
      signature,
    },
    generatedAt: new Date().toISOString(),
    platform,
    releaseRing,
    updaterEnabled,
    version,
  };
}

export function parseDesktopBuildArtifactCliArgs(argv) {
  const values = new Map();
  const allowed = new Set([
    "artifact-dir",
    "out",
    "platform",
    "ring",
    "updater-enabled",
    "version",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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
    artifactDir: values.get("artifact-dir"),
    outputPath: values.get("out"),
    platform: values.get("platform"),
    ring: values.get("ring"),
    updaterEnabled: values.get("updater-enabled"),
    version: values.get("version"),
  };
}

function selectInstallerName({ artifactNames, version }) {
  const installers = artifactNames
    .filter((name) => name.toLowerCase().endsWith(".exe"))
    .filter((name) => name.includes(version))
    .filter((name) => /setup/i.test(name))
    .sort((left, right) => left.localeCompare(right));

  if (installers.length === 0) {
    throw new Error(`No NSIS setup installer matching desktop version ${version} was found.`);
  }

  if (installers.length > 1) {
    throw new Error(
      `Expected exactly one NSIS setup installer for version ${version}, found: ${installers.join(
        ", ",
      )}.`,
    );
  }

  return installers[0];
}

async function describeArtifact(filePath, filename) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error(`Desktop artifact is not a file: ${filename}.`);
  }

  if (fileStat.size <= 0) {
    throw new Error(`Desktop artifact is empty: ${filename}.`);
  }

  return {
    filename,
    sha256: await sha256File(filePath),
    sizeBytes: fileStat.size,
  };
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeVersion(value) {
  const version = String(value || "").trim();

  if (!version) {
    throw new Error("Desktop build artifact version is required.");
  }

  if (version.startsWith("v")) {
    throw new Error("Desktop build artifact version must not include a leading v.");
  }

  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Desktop build artifact version (${version}) must be semver-like.`);
  }

  return version;
}

function normalizeRing(value) {
  const ring = String(value || "").trim();

  if (!DESKTOP_RELEASE_WORKFLOW_RINGS.includes(ring)) {
    throw new Error(
      `Desktop build artifact ring must be one of: ${DESKTOP_RELEASE_WORKFLOW_RINGS.join(", ")}.`,
    );
  }

  return ring;
}

function normalizePlatform(value) {
  const platform = String(value || "").trim();

  if (platform !== "windows-x86_64") {
    throw new Error("Desktop build artifact metadata currently supports windows-x86_64 only.");
  }

  return platform;
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseDesktopBuildArtifactCliArgs(process.argv.slice(2));
    const metadata = await createDesktopBuildMetadata(options);

    if (options.outputPath) {
      await writeFile(path.resolve(options.outputPath), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    }

    console.log(JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
