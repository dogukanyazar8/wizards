import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ENVIRONMENTS = new Set(["uat", "production"]);
const KINDS = new Set(["ota", "apk"]);

function requireSafeId(value, name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value ?? "")) {
    throw new Error(`${name} must be a path-safe identifier.`);
  }
  return value;
}

export function buildMobileReleaseContract(input) {
  if (!ENVIRONMENTS.has(input.environment)) {
    throw new Error("environment must be uat or production.");
  }
  if (!KINDS.has(input.kind)) {
    throw new Error("kind must be ota or apk.");
  }
  const releaseId = input.kind === "ota" ? requireSafeId(input.releaseId, "releaseId") : undefined;
  if (!Number.isInteger(input.rollout) || input.rollout < 0 || input.rollout > 100) {
    throw new Error("rollout must be an integer from 0 through 100.");
  }
  if (!Number.isInteger(input.runNumber) || input.runNumber <= 0) {
    throw new Error("runNumber must be a positive integer.");
  }
  if (!/^[a-f0-9]{40,64}$/u.test(input.sourceSha ?? "")) {
    throw new Error("sourceSha must be a full hexadecimal Git commit.");
  }
  if (input.kind === "ota" && input.environment !== "uat") {
    throw new Error(`${input.environment} OTA trust root is not configured; only UAT can publish.`);
  }
  if (input.kind === "apk" && input.environment === "production") {
    throw new Error("Production APK publication is forbidden.");
  }

  const apiBaseUrl =
    input.environment === "uat" ? "https://wizardsweb-uat.up.railway.app" : "https://whispr.team";
  const common = {
    apiBaseUrl,
    environment: input.environment,
    kind: input.kind,
    ...(releaseId ? { releaseId } : {}),
    rollout: input.rollout,
  };
  if (input.kind === "ota") {
    const bundleKey = requireSafeId(
      `${input.environment}-${releaseId}-${input.runNumber}-${input.sourceSha.slice(0, 12)}`,
      "bundleKey",
    );
    return {
      ...common,
      bundleKey,
      immutablePrefix: `mobile/ota/${bundleKey}/`,
      keyId: "whispr-mobile-ota-uat-2026-01",
      releaseChannel: "UAT",
    };
  }

  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(input.version ?? "")) {
    throw new Error("APK version must be a semantic version.");
  }
  const apkContract = {
    ...common,
    latestKey: `mobile/${input.environment}/latest.json`,
    releaseChannel: "UAT",
    version: input.version,
  };
  if (input.versionCode === undefined) {
    return apkContract;
  }
  if (!Number.isInteger(input.versionCode) || input.versionCode <= 0) {
    throw new Error("APK versionCode must be a positive integer.");
  }
  const fileName = `whispr-${input.version}-${input.versionCode}.apk`;
  return {
    ...apkContract,
    artifactKey: `mobile/${input.environment}/releases/v${input.version}/${fileName}`,
    fileName,
    versionCode: input.versionCode,
  };
}

export function extractFingerprintHash(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!/^[a-f0-9]{64}$/u.test(parsed?.hash ?? "")) {
    throw new Error("Expo fingerprint output has no SHA-256 hash.");
  }
  return parsed.hash;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${token ?? "<end>"}.`);
    }
    values.set(token.slice(2), value);
  }
  return values;
}

function main() {
  const values = parseArguments(process.argv.slice(2));
  const contract = buildMobileReleaseContract({
    environment: values.get("environment"),
    kind: values.get("kind"),
    releaseId: values.get("release-id"),
    rollout: Number(values.get("rollout")),
    runNumber: Number(values.get("run-number")),
    sourceSha: values.get("source-sha"),
    version: values.get("version") || undefined,
    versionCode: values.get("version-code") ? Number(values.get("version-code")) : undefined,
  });
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    for (const [key, value] of Object.entries(contract)) {
      appendFileSync(
        outputPath,
        `${key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}=${value}\n`,
      );
    }
  }
  process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
