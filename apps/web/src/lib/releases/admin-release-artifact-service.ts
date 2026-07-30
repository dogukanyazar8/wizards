import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";

export type AdminReleaseArtifactInput = {
  kind: "AAB" | "APK" | "IPA";
  platform: "ANDROID" | "IOS";
  sha256: string;
  signingCertSha256?: string | undefined;
  sizeBytes: number;
  url: string;
  versionCode: number;
};

export type AdminReleaseArtifactSummary = AdminReleaseArtifactInput & {
  id: string;
  publishedAt: Date;
  releaseId: string;
};

export type AdminReleaseArtifactServiceDependencies = {
  createArtifactAndSyncRelease(
    releaseId: string,
    channel: "BETA" | "STABLE" | "UAT",
    input: AdminReleaseArtifactInput,
    publishedAt: Date,
  ): Promise<AdminReleaseArtifactSummary>;
  findArtifact(
    channel: "BETA" | "STABLE" | "UAT",
    input: Pick<AdminReleaseArtifactInput, "kind" | "platform" | "versionCode">,
  ): Promise<{ id: string } | null>;
  findLatestVersionCode(
    channel: "BETA" | "STABLE" | "UAT",
    input: Pick<AdminReleaseArtifactInput, "kind" | "platform">,
  ): Promise<number | null>;
  findRelease(releaseId: string): Promise<{
    channel: "BETA" | "STABLE" | "UAT";
    id: string;
    publishedAt: Date | null;
  } | null>;
  now(): Date;
};

const defaultDependencies: AdminReleaseArtifactServiceDependencies = {
  async createArtifactAndSyncRelease(releaseId, channel, input, publishedAt) {
    const artifact = await prisma.$transaction(async (transaction) => {
      const { signingCertSha256, ...requiredInput } = input;
      const created = await transaction.releaseArtifact.create({
        data: {
          ...requiredInput,
          ...(signingCertSha256 ? { signingCertSha256 } : {}),
          channel,
          publishedAt,
          releaseId,
        },
        select: {
          id: true,
          kind: true,
          platform: true,
          publishedAt: true,
          releaseId: true,
          sha256: true,
          signingCertSha256: true,
          sizeBytes: true,
          url: true,
          versionCode: true,
        },
      });
      await transaction.release.update({
        data: {
          buildNumber: input.versionCode,
          sizeBytes: BigInt(input.sizeBytes),
        },
        where: { id: releaseId },
      });
      return created;
    });
    return {
      id: artifact.id,
      kind: artifact.kind,
      platform: artifact.platform,
      publishedAt: artifact.publishedAt!,
      releaseId: artifact.releaseId,
      sha256: artifact.sha256,
      sizeBytes: Number(artifact.sizeBytes),
      ...(artifact.signingCertSha256 ? { signingCertSha256: artifact.signingCertSha256 } : {}),
      url: artifact.url,
      versionCode: artifact.versionCode,
    };
  },
  findArtifact: (channel, input) =>
    prisma.releaseArtifact.findFirst({
      select: { id: true },
      where: { channel, ...input },
    }),
  async findLatestVersionCode(channel, input) {
    const artifact = await prisma.releaseArtifact.findFirst({
      orderBy: { versionCode: "desc" },
      select: { versionCode: true },
      where: { channel, ...input },
    });
    return artifact?.versionCode ?? null;
  },
  findRelease: (releaseId) =>
    prisma.release.findUnique({
      select: { channel: true, id: true, publishedAt: true },
      where: { id: releaseId },
    }),
  now: () => new Date(),
};

function validateImmutableArtifactUrl(
  input: AdminReleaseArtifactInput,
  channel: "BETA" | "STABLE" | "UAT",
) {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new ApiError("Artifact URL is invalid", 400, "ARTIFACT_URL_INVALID");
  }
  const ring = channel === "UAT" ? "uat" : channel === "BETA" ? "canary" : "production";
  const extension = input.kind.toLowerCase();
  const immutablePath = new RegExp(`^/mobile/${ring}/releases/[^/]+/[^/]+\\.${extension}$`, "u");
  if (
    url.protocol !== "https:" ||
    url.hostname !== "updates.whispr.team" ||
    !immutablePath.test(url.pathname)
  ) {
    throw new ApiError(
      "Artifact URL must use its immutable release path",
      400,
      "ARTIFACT_URL_NOT_IMMUTABLE",
    );
  }
}

export async function registerAdminReleaseArtifact(
  releaseId: string,
  input: AdminReleaseArtifactInput,
  dependencies: AdminReleaseArtifactServiceDependencies = defaultDependencies,
) {
  const release = await dependencies.findRelease(releaseId);
  if (!release) {
    throw new ApiError("Release not found", 404, "RELEASE_NOT_FOUND");
  }
  if (!release.publishedAt) {
    throw new ApiError(
      "Release must be published before an artifact",
      409,
      "RELEASE_MUST_BE_PUBLISHED",
    );
  }
  if (release.channel === "STABLE" && input.kind === "APK") {
    throw new ApiError(
      "Production releases cannot publish an internal APK",
      409,
      "PRODUCTION_APK_FORBIDDEN",
    );
  }
  validateImmutableArtifactUrl(input, release.channel);
  if (await dependencies.findArtifact(release.channel, input)) {
    throw new ApiError("Artifact version is already registered", 409, "RELEASE_ARTIFACT_EXISTS");
  }
  const latestVersionCode = await dependencies.findLatestVersionCode(release.channel, input);
  if (latestVersionCode !== null && input.versionCode <= latestVersionCode) {
    throw new ApiError(
      "Artifact versionCode must increase within its release channel",
      409,
      "ARTIFACT_VERSION_NOT_MONOTONIC",
    );
  }

  return {
    artifact: await dependencies.createArtifactAndSyncRelease(
      releaseId,
      release.channel,
      input,
      dependencies.now(),
    ),
  };
}
