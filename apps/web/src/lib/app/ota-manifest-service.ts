import { createHash } from "node:crypto";

import { z } from "zod";

export type OtaPlatform = "ANDROID" | "IOS";
export type OtaReleaseChannel = "STABLE" | "BETA" | "UAT";
export type OtaRequestChannel = "uat" | "canary" | "production";

export type OtaBundleRecord = {
  bundleKey: string;
  channel: OtaReleaseChannel;
  enabled: boolean;
  id: string;
  manifestBody: string;
  manifestSha256: string;
  manifestSignature: string;
  noUpdateDirectiveBody: string;
  noUpdateDirectiveSignature: string;
  platform: OtaPlatform;
  publishedAt: Date;
  rollbackDirectiveBody: string;
  rollbackDirectiveSignature: string;
  rolloutPercentage: number;
  runtimeVersion: string;
  signingKeyId: string;
};

export type OtaManifestRepository = {
  findLatestCompatible(input: {
    channel: OtaReleaseChannel;
    platform: OtaPlatform;
    runtimeVersion: string;
  }): Promise<OtaBundleRecord | null>;
  findLatestSigningBundle(input: {
    channel: OtaReleaseChannel;
    platform: OtaPlatform;
  }): Promise<OtaBundleRecord | null>;
};

export type OtaManifestRequest = {
  channel: OtaRequestChannel;
  currentUpdateId?: string;
  installationId: string;
  platform: "android" | "ios";
  runtimeVersion: string;
};

export type OtaManifestPart = {
  body: string;
  kind: "directive" | "manifest";
  signature: string;
  signingKeyId: string;
};

const Base64UrlSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+={0,2}$/);
const ExpoAssetSchema = z
  .object({
    contentType: z.string().min(1).max(200),
    fileExtension: z
      .string()
      .regex(/^\.[A-Za-z0-9]+$/)
      .optional(),
    hash: Base64UrlSchema.optional(),
    key: z.string().min(1).max(512),
    url: z.string().url().startsWith("https://"),
  })
  .strict();
const ExpoManifestSchema = z
  .object({
    assets: z.array(ExpoAssetSchema).max(10_000),
    createdAt: z.string().datetime(),
    extra: z.record(z.string(), z.unknown()),
    id: z.string().uuid(),
    launchAsset: ExpoAssetSchema,
    metadata: z.record(z.string(), z.string()),
    runtimeVersion: z.string().min(1).max(256),
  })
  .strict();
const NoUpdateDirectiveSchema = z.object({ type: z.literal("noUpdateAvailable") }).strict();
const RollbackDirectiveSchema = z
  .object({
    parameters: z.object({ commitTime: z.number().int().nonnegative() }).strict().optional(),
    type: z.literal("rollBackToEmbedded"),
  })
  .strict();
const SignatureSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);
const SigningKeyIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);

function mapPlatform(platform: OtaManifestRequest["platform"]): OtaPlatform {
  return platform === "android" ? "ANDROID" : "IOS";
}

export function mapOtaReleaseChannel(channel: OtaRequestChannel): OtaReleaseChannel {
  if (channel === "uat") {
    return "UAT";
  }
  if (channel === "canary") {
    return "BETA";
  }
  return "STABLE";
}

function validateSignatureMetadata(bundle: OtaBundleRecord) {
  SignatureSchema.parse(bundle.manifestSignature);
  SignatureSchema.parse(bundle.noUpdateDirectiveSignature);
  SignatureSchema.parse(bundle.rollbackDirectiveSignature);
  SigningKeyIdSchema.parse(bundle.signingKeyId);
}

function validateManifest(bundle: OtaBundleRecord, runtimeVersion: string) {
  const actualHash = createHash("sha256").update(bundle.manifestBody).digest("hex");
  if (actualHash !== bundle.manifestSha256) {
    throw new Error(`OTA manifest hash mismatch for ${bundle.id}`);
  }

  const manifest = ExpoManifestSchema.parse(JSON.parse(bundle.manifestBody) as unknown);
  if (manifest.id !== bundle.id) {
    throw new Error(`OTA manifest id mismatch for ${bundle.id}`);
  }
  if (
    manifest.runtimeVersion !== runtimeVersion ||
    manifest.runtimeVersion !== bundle.runtimeVersion
  ) {
    throw new Error(`OTA runtime version mismatch for ${bundle.id}`);
  }

  const immutablePrefix = `https://updates.whispr.team/mobile/ota/${bundle.bundleKey}/`;
  for (const asset of [manifest.launchAsset, ...manifest.assets]) {
    if (!asset.url.startsWith(immutablePrefix)) {
      throw new Error(`OTA asset URL escaped immutable prefix for ${bundle.id}`);
    }
  }
}

function noUpdatePart(bundle: OtaBundleRecord): OtaManifestPart {
  NoUpdateDirectiveSchema.parse(JSON.parse(bundle.noUpdateDirectiveBody) as unknown);
  return {
    body: bundle.noUpdateDirectiveBody,
    kind: "directive",
    signature: bundle.noUpdateDirectiveSignature,
    signingKeyId: bundle.signingKeyId,
  };
}

function rollbackPart(bundle: OtaBundleRecord): OtaManifestPart {
  RollbackDirectiveSchema.parse(JSON.parse(bundle.rollbackDirectiveBody) as unknown);
  return {
    body: bundle.rollbackDirectiveBody,
    kind: "directive",
    signature: bundle.rollbackDirectiveSignature,
    signingKeyId: bundle.signingKeyId,
  };
}

function isInRollout(installationId: string, percentage: number) {
  if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
    throw new Error(`Invalid OTA rollout percentage: ${percentage}`);
  }
  if (percentage === 100) {
    return true;
  }
  if (percentage === 0) {
    return false;
  }

  const digest = createHash("sha256").update(installationId).digest();
  return digest.readUInt32BE(0) % 100 < percentage;
}

export async function resolveOtaManifest(
  request: OtaManifestRequest,
  repository: OtaManifestRepository,
): Promise<OtaManifestPart | null> {
  const platform = mapPlatform(request.platform);
  const channel = mapOtaReleaseChannel(request.channel);
  const bundle = await repository.findLatestCompatible({
    channel,
    platform,
    runtimeVersion: request.runtimeVersion,
  });

  if (!bundle) {
    const signingFallback = await repository.findLatestSigningBundle({
      channel,
      platform,
    });
    if (!signingFallback) {
      return null;
    }
    validateSignatureMetadata(signingFallback);
    return noUpdatePart(signingFallback);
  }

  validateSignatureMetadata(bundle);
  if (!bundle.enabled) {
    return rollbackPart(bundle);
  }
  if (
    request.currentUpdateId === bundle.id ||
    !isInRollout(request.installationId, bundle.rolloutPercentage)
  ) {
    return noUpdatePart(bundle);
  }

  validateManifest(bundle, request.runtimeVersion);
  return {
    body: bundle.manifestBody,
    kind: "manifest",
    signature: bundle.manifestSignature,
    signingKeyId: bundle.signingKeyId,
  };
}

export function buildExpoMultipartResponse(part: OtaManifestPart) {
  SignatureSchema.parse(part.signature);
  SigningKeyIdSchema.parse(part.signingKeyId);
  const boundary = `whispr-${createHash("sha256").update(part.body).digest("hex").slice(0, 24)}`;
  const signature =
    `sig="${part.signature}", keyid="${part.signingKeyId}", ` + 'alg="rsa-v1_5-sha256"';
  const body = [
    `--${boundary}`,
    `content-disposition: form-data; name="${part.kind}"`,
    "content-type: application/json",
    `expo-signature: ${signature}`,
    "",
    part.body,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return {
    body,
    contentType: `multipart/mixed; boundary=${boundary}`,
  };
}
