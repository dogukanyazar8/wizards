import { createHash } from "node:crypto";

import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";

export type AdminOtaBundleInput = {
  bundleKey: string;
  channel: "STABLE" | "UAT";
  enabled: boolean;
  id: string;
  manifestBody: string;
  manifestSha256: string;
  manifestSignature: string;
  noUpdateDirectiveBody: string;
  noUpdateDirectiveSignature: string;
  platform: "ANDROID" | "IOS";
  rollbackDirectiveBody: string;
  rollbackDirectiveSignature: string;
  rolloutPercentage: number;
  runtimeVersion: string;
  signingKeyId: string;
};

type AdminOtaBundleSummary = {
  bundleKey: string;
  enabled: boolean;
  id: string;
  publishedAt: Date | null;
  releaseId: string;
  rolloutPercentage: number;
};

type AdminOtaBundleEnabledSummary = {
  enabled: boolean;
  id: string;
  releaseId: string;
};

export type AdminOtaServiceDependencies = {
  createBundle(
    releaseId: string,
    input: AdminOtaBundleInput,
    publishedAt: Date,
  ): Promise<AdminOtaBundleSummary>;
  findBundleByKey(bundleKey: string): Promise<{ id: string } | null>;
  findRelease(releaseId: string): Promise<{
    channel: "STABLE" | "UAT";
    id: string;
    publishedAt: Date | null;
  } | null>;
  now(): Date;
  setBundleEnabled(
    releaseId: string,
    bundleId: string,
    enabled: boolean,
  ): Promise<AdminOtaBundleEnabledSummary | null>;
};

const defaultDependencies: AdminOtaServiceDependencies = {
  createBundle: (releaseId, input, publishedAt) =>
    prisma.otaBundle.create({
      data: {
        ...input,
        publishedAt,
        releaseId,
      },
      select: {
        bundleKey: true,
        enabled: true,
        id: true,
        publishedAt: true,
        releaseId: true,
        rolloutPercentage: true,
      },
    }),
  findBundleByKey: (bundleKey) =>
    prisma.otaBundle.findUnique({
      select: { id: true },
      where: { bundleKey },
    }),
  findRelease: (releaseId) =>
    prisma.release.findFirst({
      select: { channel: true, id: true, publishedAt: true },
      where: { id: releaseId, product: "MOBILE", withdrawnAt: null },
    }),
  now: () => new Date(),
  async setBundleEnabled(releaseId, bundleId, enabled) {
    const existing = await prisma.otaBundle.findFirst({
      select: { id: true },
      where: { id: bundleId, releaseId },
    });
    if (!existing) {
      return null;
    }
    return prisma.otaBundle.update({
      data: { enabled },
      select: { enabled: true, id: true, releaseId: true },
      where: { id: bundleId, release: { withdrawnAt: null, product: "MOBILE" } },
    });
  },
};

function parseJsonBody(body: string, label: string) {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ApiError(`${label} must be valid JSON`, 400, "OTA_SIGNED_BODY_INVALID");
  }
}

function validateSignedMetadata(input: AdminOtaBundleInput) {
  const actualHash = createHash("sha256").update(input.manifestBody).digest("hex");
  if (actualHash !== input.manifestSha256) {
    throw new ApiError(
      "Manifest hash does not match the signed body",
      400,
      "OTA_MANIFEST_HASH_MISMATCH",
    );
  }

  const manifest = parseJsonBody(input.manifestBody, "Manifest") as {
    id?: unknown;
    runtimeVersion?: unknown;
  };
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    manifest.id !== input.id ||
    manifest.runtimeVersion !== input.runtimeVersion
  ) {
    throw new ApiError(
      "Manifest identity or runtime version does not match publication metadata",
      400,
      "OTA_MANIFEST_METADATA_MISMATCH",
    );
  }

  const noUpdate = parseJsonBody(input.noUpdateDirectiveBody, "No-update directive") as {
    type?: unknown;
  };
  const rollback = parseJsonBody(input.rollbackDirectiveBody, "Rollback directive") as {
    type?: unknown;
  };
  if (noUpdate?.type !== "noUpdateAvailable") {
    throw new ApiError("Invalid no-update directive", 400, "OTA_DIRECTIVE_INVALID");
  }
  if (rollback?.type !== "rollBackToEmbedded") {
    throw new ApiError("Invalid rollback directive", 400, "OTA_DIRECTIVE_INVALID");
  }
}

export async function registerAdminOtaBundle(
  releaseId: string,
  input: AdminOtaBundleInput,
  dependencies: AdminOtaServiceDependencies = defaultDependencies,
) {
  validateSignedMetadata(input);
  const release = await dependencies.findRelease(releaseId);
  if (!release) {
    throw new ApiError("Release not found", 404, "RELEASE_NOT_FOUND");
  }
  if (!release.publishedAt) {
    throw new ApiError(
      "Release must be published before an OTA bundle",
      409,
      "RELEASE_MUST_BE_PUBLISHED",
    );
  }
  if (release.channel !== input.channel) {
    throw new ApiError("OTA channel must match the release channel", 409, "OTA_CHANNEL_MISMATCH");
  }
  if (await dependencies.findBundleByKey(input.bundleKey)) {
    throw new ApiError("OTA bundle key already exists", 409, "OTA_BUNDLE_EXISTS");
  }

  const bundle = await dependencies.createBundle(releaseId, input, dependencies.now());
  return { bundle };
}

export async function setAdminOtaBundleEnabled(
  releaseId: string,
  bundleId: string,
  enabled: boolean,
  dependencies: AdminOtaServiceDependencies = defaultDependencies,
) {
  const bundle = await dependencies.setBundleEnabled(releaseId, bundleId, enabled);
  if (!bundle) {
    throw new ApiError("OTA bundle not found", 404, "OTA_BUNDLE_NOT_FOUND");
  }
  return { bundle };
}
