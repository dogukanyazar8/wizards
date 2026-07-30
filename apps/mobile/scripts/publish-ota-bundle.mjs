import { createHash, createSign, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const MOBILE_ROOT = resolve(SCRIPT_PATH, "..", "..");
const DEFAULT_WORKSPACE_ROOT = resolve(MOBILE_ROOT, "..", "..");
const VALID_ENVIRONMENTS = new Set(["uat", "canary", "production"]);
const VALID_PLATFORMS = new Set(["android", "ios"]);

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function assertHttpsUrl(value, name) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS.`);
  }
  return url.toString().replace(/\/$/, "");
}

function assertBundleKey(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
    throw new Error("bundleKey must be an immutable, path-safe identifier.");
  }
}

export function buildMobileOtaPublishPlan(options) {
  const workspaceRoot = realpathSync(resolve(options.workspaceRoot));
  const privateKeyPath = realpathSync(resolve(options.privateKeyPath));
  if (isInside(workspaceRoot, privateKeyPath)) {
    throw new Error("OTA private key must stay outside the workspace.");
  }
  if (!VALID_ENVIRONMENTS.has(options.environment)) {
    throw new Error("environment must be uat, canary, or production.");
  }
  if (!VALID_PLATFORMS.has(options.platform)) {
    throw new Error("platform must be android or ios.");
  }
  if (
    !Number.isInteger(options.rolloutPercentage) ||
    options.rolloutPercentage < 0 ||
    options.rolloutPercentage > 100
  ) {
    throw new Error("rolloutPercentage must be an integer from 0 through 100.");
  }
  assertBundleKey(options.bundleKey);
  const adminBaseUrl = assertHttpsUrl(options.adminBaseUrl, "adminBaseUrl");
  const immutablePrefix = `mobile/ota/${options.bundleKey}/`;

  return {
    environment: options.environment,
    immutablePrefix,
    platform: options.platform,
    releaseId: options.releaseId,
    rolloutPercentage: options.rolloutPercentage,
    runtimeVersion: options.runtimeVersion,
    signingKey: "<external-private-key>",
    steps: [
      {
        name: "export",
        output: `.artifacts/mobile-ota/${options.bundleKey}/dist`,
        tool: "expo export",
      },
      {
        name: "fingerprint",
        expected: options.runtimeVersion,
        tool: "expo-updates fingerprint:generate",
      },
      {
        key: "<external-private-key>",
        name: "sign",
        output: `.artifacts/mobile-ota/${options.bundleKey}/registration.json`,
        tool: "RSA-SHA256",
      },
      {
        destination: `s3://<R2_BUCKET>/${immutablePrefix}`,
        name: "r2-upload",
        tool: "aws s3 cp",
      },
      {
        name: "register",
        target: `${adminBaseUrl}/api/v1/admin/releases/${encodeURIComponent(
          options.releaseId,
        )}/ota`,
      },
      {
        name: "remote-verify",
        target: `${adminBaseUrl}/api/v1/app/updates/manifest`,
      },
    ],
  };
}

function signBody(body, privateKeyPem) {
  const signer = createSign("RSA-SHA256");
  signer.update(body, "utf8");
  signer.end();
  return signer.sign(privateKeyPem, "base64");
}

const CONTENT_TYPES = Object.freeze({
  hbc: "application/x-hermes-bytecode",
  js: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  ttf: "font/ttf",
  otf: "font/otf",
});

function normalizeExportPath(value) {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/u, "");
  if (
    normalized.length === 0 ||
    normalized.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    throw new Error(`Invalid Expo export path: ${value}`);
  }
  return normalized;
}

function digestFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("base64url");
}

function contentTypeFor(filePath, explicitExtension) {
  const extension = (explicitExtension || extname(filePath).slice(1)).toLowerCase();
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

function exportFileRecord(exportDirectory, bundleKey, relativePath, explicitExtension) {
  const normalizedPath = normalizeExportPath(relativePath);
  const localPath = resolve(exportDirectory, ...normalizedPath.split("/"));
  const relativeToExport = relative(exportDirectory, localPath);
  if (
    relativeToExport.startsWith("..") ||
    isAbsolute(relativeToExport) ||
    !statSync(localPath).isFile()
  ) {
    throw new Error(`Expo export file is outside the export directory: ${relativePath}`);
  }
  const hash = digestFile(localPath);
  const extension = (explicitExtension || extname(normalizedPath).slice(1)).toLowerCase();
  const key = `mobile/ota/${bundleKey}/${normalizedPath}`;
  return {
    manifest: {
      contentType: contentTypeFor(normalizedPath, extension),
      ...(extension ? { fileExtension: `.${extension}` } : {}),
      hash,
      key: hash,
      url: `https://updates.whispr.team/${key}`,
    },
    upload: {
      contentType: contentTypeFor(normalizedPath, extension),
      key,
      localPath,
      sizeBytes: statSync(localPath).size,
    },
  };
}

export function prepareMobileOtaPublication(options) {
  assertBundleKey(options.bundleKey);
  if (!VALID_PLATFORMS.has(options.platform)) {
    throw new Error("platform must be android or ios.");
  }
  if (
    !Number.isInteger(options.rolloutPercentage) ||
    options.rolloutPercentage < 0 ||
    options.rolloutPercentage > 100
  ) {
    throw new Error("rolloutPercentage must be an integer from 0 through 100.");
  }
  const exportDirectory = realpathSync(resolve(options.exportDirectory));
  const metadata = JSON.parse(readFileSync(resolve(exportDirectory, "metadata.json"), "utf8"));
  const platformMetadata = metadata?.fileMetadata?.[options.platform];
  if (!platformMetadata?.bundle || !Array.isArray(platformMetadata.assets)) {
    throw new Error(`Expo export has no ${options.platform} bundle metadata.`);
  }

  const launch = exportFileRecord(exportDirectory, options.bundleKey, platformMetadata.bundle);
  const assets = platformMetadata.assets.map((asset) =>
    exportFileRecord(exportDirectory, options.bundleKey, asset.path, asset.ext),
  );
  const id = options.id ?? randomUUID();
  const createdAt = options.createdAt ?? new Date().toISOString();
  const manifestBody = JSON.stringify({
    assets: assets.map((asset) => asset.manifest),
    createdAt,
    extra: {},
    id,
    launchAsset: launch.manifest,
    metadata: {},
    runtimeVersion: options.runtimeVersion,
  });
  const signed = createSignedOtaMetadata({
    manifestBody,
    privateKeyPem: options.privateKeyPem,
    rollbackCommitTime: Date.parse(createdAt),
  });

  return {
    registration: {
      payload: {
        bundleKey: options.bundleKey,
        channel: options.channel,
        enabled: true,
        id,
        manifestBody,
        ...signed,
        platform: options.platform.toUpperCase(),
        rolloutPercentage: options.rolloutPercentage,
        runtimeVersion: options.runtimeVersion,
        signingKeyId: options.keyId,
      },
      releaseId: options.releaseId,
    },
    uploads: [launch.upload, ...assets.map((asset) => asset.upload)],
  };
}

export function createSignedOtaMetadata({ manifestBody, privateKeyPem, rollbackCommitTime }) {
  const noUpdateDirectiveBody = JSON.stringify({
    type: "noUpdateAvailable",
  });
  const rollbackDirectiveBody = JSON.stringify({
    type: "rollBackToEmbedded",
    ...(rollbackCommitTime ? { parameters: { commitTime: rollbackCommitTime } } : {}),
  });

  return {
    manifestSha256: createHash("sha256").update(manifestBody).digest("hex"),
    manifestSignature: signBody(manifestBody, privateKeyPem),
    noUpdateDirectiveBody,
    noUpdateDirectiveSignature: signBody(noUpdateDirectiveBody, privateKeyPem),
    rollbackDirectiveBody,
    rollbackDirectiveSignature: signBody(rollbackDirectiveBody, privateKeyPem),
  };
}

function parseArguments(argv) {
  const values = new Map();
  let dryRun = false;
  let prepare = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token === "--prepare") {
      prepare = true;
      continue;
    }
    if (!token?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    values.set(token.slice(2), value);
    index += 1;
  }
  const required = [
    "admin-base-url",
    "bundle-key",
    "environment",
    "platform",
    "private-key-path",
    "release-id",
    "runtime-version",
  ];
  for (const key of required) {
    if (!values.has(key)) {
      throw new Error(`--${key} is required.`);
    }
  }

  return {
    dryRun,
    prepare,
    options: {
      adminBaseUrl: values.get("admin-base-url"),
      bundleKey: values.get("bundle-key"),
      channel: values.get("channel"),
      environment: values.get("environment"),
      exportDirectory: values.get("export-dir"),
      keyId: values.get("key-id"),
      platform: values.get("platform"),
      privateKeyPath: values.get("private-key-path"),
      registrationOut: values.get("registration-out"),
      releaseId: values.get("release-id"),
      rolloutPercentage: Number(values.get("rollout") ?? "100"),
      runtimeVersion: values.get("runtime-version"),
      uploadsOut: values.get("uploads-out"),
      workspaceRoot: values.get("workspace-root") ?? DEFAULT_WORKSPACE_ROOT,
    },
  };
}

function main() {
  const { dryRun, options, prepare } = parseArguments(process.argv.slice(2));
  if (!existsSync(options.privateKeyPath)) {
    throw new Error("OTA private key file does not exist.");
  }
  const plan = buildMobileOtaPublishPlan(options);
  if (prepare) {
    const requiredPrepare = ["channel", "export-dir", "key-id", "registration-out", "uploads-out"];
    const prepareValues = {
      channel: options.channel,
      "export-dir": options.exportDirectory,
      "key-id": options.keyId,
      "registration-out": options.registrationOut,
      "uploads-out": options.uploadsOut,
    };
    for (const name of requiredPrepare) {
      if (!prepareValues[name]) {
        throw new Error(`--${name} is required with --prepare.`);
      }
    }
    const prepared = prepareMobileOtaPublication({
      bundleKey: options.bundleKey,
      channel: options.channel,
      exportDirectory: options.exportDirectory,
      keyId: options.keyId,
      platform: options.platform,
      privateKeyPem: readFileSync(options.privateKeyPath, "utf8"),
      releaseId: options.releaseId,
      rolloutPercentage: options.rolloutPercentage,
      runtimeVersion: options.runtimeVersion,
    });
    writeFileSync(options.registrationOut, `${JSON.stringify(prepared.registration, null, 2)}\n`, {
      mode: 0o600,
    });
    writeFileSync(options.uploadsOut, `${JSON.stringify(prepared.uploads, null, 2)}\n`, {
      mode: 0o600,
    });
    process.stdout.write(
      `${JSON.stringify({
        bundleKey: options.bundleKey,
        registration: "<redacted-signed-registration>",
        uploadCount: prepared.uploads.length,
      })}\n`,
    );
    return;
  }
  if (!dryRun) {
    throw new Error(
      "Publication execution is CI-owned; run the mobile release workflow. This command only produces the reviewed dry-run plan.",
    );
  }
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
