import { prisma, type Prisma } from "@wizards/db";
import {
  AppDownloadsResponseSchema,
  DOWNLOAD_DESKTOP_PLATFORMS,
  DOWNLOAD_ENVIRONMENT_CHANNEL,
  DOWNLOAD_MOBILE_PLATFORMS,
  type AppDownloadsResponse,
  type DownloadArtifact,
  type DownloadCatalog,
  type DownloadEnvironment,
  type DownloadPlatform,
  type DownloadSection,
} from "@wizards/types";

/**
 * SPEC-INDIRME §B kataloğu.
 *
 * Pencere iki ortamı yan yana anlatıyor ve ortam değiştirmek anında oluyor, o
 * yüzden bu servis **iki kataloğu birden** kurar: ikinci bir sorgu, kullanıcı
 * için görünür bir bekleme demekti. Tek `findMany` ile okunur; ortam ayrımı
 * bellekte yapılır çünkü satır sayısı ortam başına en fazla beş.
 */

const downloadArtifactSelect = {
  buildLabel: true,
  channel: true,
  delivery: true,
  extensionLabelEn: true,
  extensionLabelTr: true,
  metaLabelEn: true,
  metaLabelTr: true,
  platform: true,
  releasedAt: true,
  sha256: true,
  sizeBytes: true,
  url: true,
  versionLabel: true,
} satisfies Prisma.DownloadArtifactSelect;

export type DownloadArtifactRow = Prisma.DownloadArtifactGetPayload<{
  select: typeof downloadArtifactSelect;
}>;

const PLATFORM_FROM_COLUMN = {
  ANDROID: "android",
  IOS: "ios",
  LINUX: "linux",
  MACOS: "macos",
  WINDOWS: "windows",
} as const satisfies Record<DownloadArtifactRow["platform"], DownloadPlatform>;

const DELIVERY_FROM_COLUMN = {
  DIRECT: "direct",
  STORE: "store",
  TESTFLIGHT: "testflight",
} as const satisfies Record<DownloadArtifactRow["delivery"], DownloadArtifact["delivery"]>;

const ENVIRONMENTS = ["prod", "uat"] as const satisfies readonly DownloadEnvironment[];

export type DownloadCatalogDependencies = {
  findArtifacts(): Promise<DownloadArtifactRow[]>;
  readReleaseChannel(): string | undefined;
};

const defaultDependencies: DownloadCatalogDependencies = {
  findArtifacts: () =>
    prisma.downloadArtifact.findMany({
      // A draft row is invisible by contract, exactly like an unpublished
      // `Release`: the window must never advertise a build nobody announced.
      where: { channel: { in: ["STABLE", "UAT"] }, publishedAt: { not: null } },
      select: downloadArtifactSelect,
    }),
  readReleaseChannel: () => process.env.WHISPR_RELEASE_CHANNEL,
};

/**
 * Uygulamanın koştuğu ortam pencerenin varsayılan seçimidir (K4). Bilinmeyen
 * bir kanal `prod`'a düşer: kullanıcıya önce yayındaki kararlı sürümü göstermek,
 * test ortamını göstermekten her zaman daha güvenli bir varsayılandır.
 */
export function resolveDefaultDownloadEnvironment(
  channel: string | undefined,
): DownloadEnvironment {
  return channel?.trim().toLowerCase() === "uat" ? "uat" : "prod";
}

function toWireArtifact(row: DownloadArtifactRow): DownloadArtifact {
  return {
    buildLabel: row.buildLabel,
    delivery: DELIVERY_FROM_COLUMN[row.delivery],
    extensionLabel: { en: row.extensionLabelEn, tr: row.extensionLabelTr },
    metaLabel: { en: row.metaLabelEn, tr: row.metaLabelTr },
    platform: PLATFORM_FROM_COLUMN[row.platform],
    sha256: row.sha256,
    // The column is a Prisma `BigInt`, which does not serialize; the wire
    // contract is a plain number and a missing size stays null.
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    url: row.url,
    versionLabel: row.versionLabel,
  };
}

/**
 * Bölüm başlığı tek bir sürüm söylemek zorunda. İki kart iki farklı sürüm
 * taşıyabildiği için başlık **en yeni yayınlanan** karttan türetilir; eşitlikte
 * tasarımdaki kart sırası kazanır.
 */
function toSection(
  rows: readonly DownloadArtifactRow[],
  order: readonly DownloadPlatform[],
): DownloadSection {
  const ordered = order.flatMap((platform) => {
    const row = rows.find((entry) => PLATFORM_FROM_COLUMN[entry.platform] === platform);
    return row ? [row] : [];
  });

  const newest = ordered.reduce<DownloadArtifactRow | null>((latest, row) => {
    if (latest === null || row.releasedAt.getTime() > latest.releasedAt.getTime()) {
      return row;
    }

    return latest;
  }, null);

  return {
    artifacts: ordered.map(toWireArtifact),
    buildLabel: newest?.buildLabel ?? null,
    releasedAt: newest?.releasedAt.toISOString() ?? null,
    versionLabel: newest?.versionLabel ?? null,
  };
}

function toCatalog(
  environment: DownloadEnvironment,
  rows: readonly DownloadArtifactRow[],
): DownloadCatalog {
  const channel = DOWNLOAD_ENVIRONMENT_CHANNEL[environment];
  const scoped = rows.filter((row) => row.channel === channel);

  return {
    desktop: toSection(scoped, DOWNLOAD_DESKTOP_PLATFORMS),
    environment,
    mobile: toSection(scoped, DOWNLOAD_MOBILE_PLATFORMS),
  };
}

export async function getAppDownloadCatalog(
  dependencies: DownloadCatalogDependencies = defaultDependencies,
): Promise<AppDownloadsResponse> {
  const rows = await dependencies.findArtifacts();
  const [prod, uat] = ENVIRONMENTS.map((environment) => toCatalog(environment, rows));

  return AppDownloadsResponseSchema.parse({
    catalogs: { prod, uat },
    defaultEnvironment: resolveDefaultDownloadEnvironment(dependencies.readReleaseChannel()),
  });
}
