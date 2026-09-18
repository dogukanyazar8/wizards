import { prisma } from "@wizards/db";
import type {
  MobileAppUpdateQuery,
  MobileAppUpdateResponse,
  MobileReleaseChannel,
} from "@wizards/types";

import { compareReleaseVersions } from "@/lib/releases/release-service";

type DatabaseReleaseChannel = "STABLE" | "UAT";
type DatabasePlatform = "ANDROID" | "IOS";

export type MobileUpdateReleaseRecord = {
  artifacts: Array<{
    kind: "APK" | "AAB" | "IPA";
    platform: DatabasePlatform;
    publishedAt: Date | null;
    sha256: string;
    signingCertSha256: string | null;
    sizeBytes: bigint;
    url: string;
    versionCode: number;
  }>;
  channel: DatabaseReleaseChannel;
  codename: string | null;
  mandatory: boolean;
  minSupportedVersionCode: number | null;
  otaBundles: Array<{
    enabled: boolean;
    platform: DatabasePlatform;
    publishedAt: Date | null;
    runtimeVersion: string;
  }>;
  releasedAt: Date;
  sizeBytes: bigint | null;
  version: string;
};

export type MobileUpdateDecisionDependencies = {
  findLatestRelease(channel: DatabaseReleaseChannel): Promise<MobileUpdateReleaseRecord | null>;
};

const CHANNEL_TO_DATABASE: Record<MobileReleaseChannel, DatabaseReleaseChannel> = {
  beta: "UAT",
  stable: "STABLE",
};

const defaultDependencies: MobileUpdateDecisionDependencies = {
  findLatestRelease: (channel) =>
    prisma.release.findFirst({
      orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
      select: {
        artifacts: {
          orderBy: [{ versionCode: "desc" }, { publishedAt: "desc" }],
          select: {
            kind: true,
            platform: true,
            publishedAt: true,
            sha256: true,
            signingCertSha256: true,
            sizeBytes: true,
            url: true,
            versionCode: true,
          },
          where: { publishedAt: { not: null } },
        },
        channel: true,
        codename: true,
        mandatory: true,
        minSupportedVersionCode: true,
        otaBundles: {
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          select: {
            enabled: true,
            platform: true,
            publishedAt: true,
            runtimeVersion: true,
          },
          where: { publishedAt: { not: null } },
        },
        releasedAt: true,
        sizeBytes: true,
        version: true,
      },
      where: {
        product: "MOBILE",
        active: true,
        withdrawnAt: null,
        channel,
        publishedAt: { not: null },
      },
    }),
};

function latestPayload(release: MobileUpdateReleaseRecord, forcedByMinimumVersionCode: boolean) {
  return {
    ...(release.codename ? { codename: release.codename } : {}),
    mandatory: release.mandatory || forcedByMinimumVersionCode,
    releasedAt: release.releasedAt.toISOString(),
    ...(release.sizeBytes === null ? {} : { sizeBytes: Number(release.sizeBytes) }),
    version: release.version,
  };
}

function environmentMatchesInternalChannel(
  environment: MobileAppUpdateQuery["buildEnvironment"],
  channel: DatabaseReleaseChannel,
): boolean {
  return environment === "uat" && channel === "UAT";
}

type MobileUpdateDecision = Omit<MobileAppUpdateResponse, "lastCheckedAt">;

export async function decideMobileUpdate(
  input: MobileAppUpdateQuery,
  dependencies: MobileUpdateDecisionDependencies = defaultDependencies,
): Promise<MobileUpdateDecision> {
  const channel = CHANNEL_TO_DATABASE[input.channel ?? "stable"];
  const release = await dependencies.findLatestRelease(channel);
  const forcedByMinimumVersionCode =
    release !== null &&
    release.minSupportedVersionCode !== null &&
    input.versionCode !== undefined &&
    input.versionCode < release.minSupportedVersionCode;
  const internalAndroid =
    release !== null &&
    input.platform === "android" &&
    environmentMatchesInternalChannel(input.buildEnvironment, release.channel);
  const artifact = release?.artifacts.find(
    (candidate) =>
      candidate.kind === "APK" &&
      candidate.platform === "ANDROID" &&
      candidate.publishedAt !== null &&
      input.versionCode !== undefined &&
      candidate.versionCode > input.versionCode,
  );
  const isBehind =
    release !== null &&
    (forcedByMinimumVersionCode ||
      (internalAndroid && artifact !== undefined) ||
      (input.installed !== undefined &&
        compareReleaseVersions(input.installed, release.version) < 0));

  if (!release) {
    return { otaEnabled: false, state: "current", updateKind: "none" };
  }

  const platform: DatabasePlatform | null =
    input.platform === "android" ? "ANDROID" : input.platform === "ios" ? "IOS" : null;
  const compatibleOta =
    platform && input.runtimeVersion
      ? release.otaBundles.find(
          (bundle) =>
            bundle.publishedAt !== null &&
            bundle.platform === platform &&
            bundle.runtimeVersion === input.runtimeVersion,
        )
      : undefined;
  const minimum = release.minSupportedVersionCode;
  const latest = isBehind ? { latest: latestPayload(release, forcedByMinimumVersionCode) } : {};
  const minimumPayload = minimum === null ? {} : { minSupportedVersionCode: minimum };

  // A disabled compatible row still selects the OTA adapter: the anonymous
  // Expo manifest endpoint uses that row to send a signed rollback directive.
  const matchingEnvironment =
    (input.buildEnvironment === "uat" && release.channel === "UAT") ||
    (input.buildEnvironment === "production" && release.channel === "STABLE");
  if (compatibleOta && matchingEnvironment) {
    return {
      ...latest,
      ...minimumPayload,
      otaEnabled: true,
      state: isBehind ? "available" : "current",
      updateKind: "ota",
    };
  }

  if (!isBehind) {
    return {
      ...minimumPayload,
      otaEnabled: false,
      state: "current",
      updateKind: "none",
    };
  }

  if (internalAndroid && artifact) {
    return {
      androidArtifact: {
        sha256: artifact.sha256,
        ...(artifact.signingCertSha256 ? { signingCertSha256: artifact.signingCertSha256 } : {}),
        sizeBytes: Number(artifact.sizeBytes),
        url: artifact.url,
        versionCode: artifact.versionCode,
      },
      ...latest,
      ...minimumPayload,
      otaEnabled: false,
      state: "available",
      updateKind: "apk",
    };
  }

  if (input.buildEnvironment === "production" && input.platform === "android") {
    return {
      ...latest,
      ...minimumPayload,
      otaEnabled: false,
      state: "available",
      updateKind: "store",
    };
  }

  return {
    ...latest,
    ...minimumPayload,
    otaEnabled: false,
    state: "current",
    updateKind: "none",
  };
}
