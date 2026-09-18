import { prisma, type Prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import {
  PublicationSchema,
  publicationDigest,
  type Publication,
  type PublicationScope,
} from "./publication-contract";
import { assertPublicationAdvance } from "./publication-policy";

const latestOrder = [{ publishedAt: "desc" as const }, { id: "desc" as const }];

export async function publicationBaseline(scope: PublicationScope) {
  // Includes withdrawn/superseded publications: release history never moves backwards.
  return prisma.release.findFirst({
    where: { ...scope, publishedAt: { not: null }, publicationDigest: { not: null } },
    orderBy: latestOrder,
    select: { sourceSha: true, version: true },
  });
}

export async function lockPublication(
  transaction: Prisma.TransactionClient,
  scope: PublicationScope,
) {
  const key = `release:${scope.product}:${scope.channel}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function publishRelease(input: Publication) {
  input = PublicationSchema.parse(input);
  const digest = publicationDigest(input);
  const { product, channel, version } = input;
  return prisma.$transaction(
    async (transaction) => {
      await lockPublication(transaction, input);
      const existing = await transaction.release.findUnique({
        where: { product_channel_version: { product, channel, version } },
      });
      if (existing?.publicationDigest) {
        if (existing.publicationDigest !== digest)
          throw new ApiError(
            "Published package identity cannot change",
            409,
            "PUBLICATION_CONFLICT",
          );
        return {
          releaseId: existing.id,
          replay: true,
          active: existing.active && !existing.withdrawnAt,
        };
      }
      if (existing?.publishedAt)
        throw new ApiError(
          "Version already published manually; choose a new version",
          409,
          "PUBLICATION_CONFLICT",
        );
      if (existing?.withdrawnAt)
        throw new ApiError("Withdrawn releases cannot be published", 409, "PUBLICATION_WITHDRAWN");
      const previous =
        (await transaction.release.findFirst({
          where: { product, channel, publishedAt: { not: null }, publicationDigest: { not: null } },
          orderBy: latestOrder,
          select: { version: true, sourceSha: true },
        })) ??
        (await transaction.release.findFirst({
          where: { product, channel, publishedAt: { not: null } },
          orderBy: latestOrder,
          select: { version: true, sourceSha: true },
        }));
      assertPublicationAdvance(input, previous);
      // Check all native version codes, including withdrawn publications.
      for (const item of input.packages) {
        if (item.platform !== "ANDROID") continue;
        const latest = await transaction.releaseArtifact.findFirst({
          where: { channel, platform: "ANDROID", kind: "APK" },
          orderBy: { versionCode: "desc" },
          select: { versionCode: true },
        });
        if (latest && item.versionCode! <= latest.versionCode)
          throw new ApiError(
            "Android versionCode must increase",
            409,
            "ARTIFACT_VERSION_NOT_MONOTONIC",
          );
      }
      const now = new Date();
      await transaction.release.updateMany({
        where: { product, channel, active: true },
        data: { active: false },
      });
      const data = {
        product,
        channel,
        version,
        sourceSha: input.sourceSha,
        sourceRunId: input.sourceRunId,
        publicationDigest: digest,
        publication: input as Prisma.InputJsonValue,
        publishedAt: now,
        releasedAt: now,
        active: true,
        buildNumber: input.packages[0]?.versionCode ?? null,
        sizeBytes: BigInt(input.packages[0]!.sizeBytes),
      };
      const release = existing
        ? await transaction.release.update({ where: { id: existing.id }, data })
        : await transaction.release.create({ data });
      // Preserve authored draft notes; retries above never overwrite admin edits.
      if (
        !existing ||
        !(await transaction.releaseChange.count({ where: { releaseId: release.id } }))
      ) {
        await transaction.releaseChange.createMany({
          data: input.changes.map((change, position) => ({
            ...change,
            detail: change.detail ?? null,
            position,
            releaseId: release.id,
          })),
        });
      }
      const platforms =
        product === "DESKTOP"
          ? (["WINDOWS", "MACOS", "LINUX"] as const)
          : (["ANDROID", "IOS"] as const);
      await transaction.downloadArtifact.updateMany({
        where: { channel, platform: { in: [...platforms] }, releaseId: { not: null } },
        data: { publishedAt: null },
      });
      for (const item of input.packages) {
        const extension =
          item.platform === "ANDROID"
            ? ".apk"
            : item.url.slice(item.url.lastIndexOf(".")).slice(0, 20);
        const label = `${item.platform} · ${item.arch} · ${(item.sizeBytes / 1048576).toFixed(1)} MB`;
        const download = {
          releaseId: release.id,
          channel,
          platform: item.platform,
          delivery: "DIRECT" as const,
          url: item.url,
          sha256: item.sha256,
          sizeBytes: BigInt(item.sizeBytes),
          versionLabel: version,
          buildLabel: item.versionCode?.toString() ?? null,
          extensionLabelTr: extension,
          extensionLabelEn: extension,
          metaLabelTr: label,
          metaLabelEn: label,
          releasedAt: now,
          publishedAt: now,
        };
        await transaction.downloadArtifact.upsert({
          where: { channel_platform: { channel, platform: item.platform } },
          create: download,
          update: download,
        });
        if (item.platform === "ANDROID") {
          await transaction.releaseArtifact.create({
            data: {
              releaseId: release.id,
              channel,
              platform: "ANDROID",
              kind: "APK",
              url: item.url,
              sha256: item.sha256,
              sizeBytes: BigInt(item.sizeBytes),
              versionCode: item.versionCode!,
              signingCertSha256: item.signingCertSha256!,
              publishedAt: now,
            },
          });
        }
      }
      await transaction.adminAuditLog.create({
        data: {
          action: "release.workflow.publish",
          targetType: "Release",
          targetId: release.id,
          metadata: {
            sourceSha: input.sourceSha,
            sourceRunId: input.sourceRunId,
            product,
            channel,
            digest,
          },
        },
      });
      return { releaseId: release.id, replay: false, active: true };
    },
    { maxWait: 10000, timeout: 15000 },
  );
}

export async function withdrawRelease(releaseId: string) {
  return prisma.$transaction(async (transaction) => {
    const release = await transaction.release.findUnique({ where: { id: releaseId } });
    if (!release) throw new ApiError("Release not found", 404);
    await lockPublication(transaction, release);
    await transaction.release.update({
      where: { id: releaseId },
      data: { active: false, withdrawnAt: release.withdrawnAt ?? new Date() },
    });
    await transaction.downloadArtifact.updateMany({
      where: { releaseId },
      data: { publishedAt: null },
    });
    await transaction.releaseArtifact.updateMany({
      where: { releaseId },
      data: { publishedAt: null },
    });
    await transaction.otaBundle.updateMany({ where: { releaseId }, data: { enabled: false } });
    return { withdrawn: true };
  });
}

export async function desktopPublicationFeed(channel: Publication["channel"]) {
  const release = await prisma.release.findFirst({
    where: {
      product: "DESKTOP",
      channel,
      publishedAt: { not: null },
      active: true,
      withdrawnAt: null,
      publicationDigest: { not: null },
    },
    orderBy: latestOrder,
    include: { changes: { orderBy: { position: "asc" } } },
  });
  if (!release) return null;
  const publication = PublicationSchema.parse(release.publication);
  const platforms: Record<string, { url: string; signature: string }> = {};
  for (const item of publication.packages) {
    const platform = {
      WINDOWS: "windows",
      MACOS: "darwin",
      LINUX: "linux",
      ANDROID: "android",
      IOS: "ios",
    }[item.platform];
    platforms[`${platform}-${item.arch}`] = { url: item.url, signature: item.signature! };
  }
  return {
    version: release.version,
    pub_date: release.publishedAt!.toISOString(),
    notes: [
      release.summary,
      ...release.changes.map(
        (change) => `${change.title}${change.detail ? `\n${change.detail}` : ""}`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n"),
    platforms,
  };
}
