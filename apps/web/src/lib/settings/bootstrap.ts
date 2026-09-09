import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma, type UserStatus } from "@wizards/db";
import { getWhisprVersionPayload } from "@/lib/app-version";
import type { SettingsBootstrapPayload } from "@/lib/settings/bootstrap-types";

type SettingsBootstrapUser = {
  avatarUrl: string | null;
  displayName: string | null;
  email: string;
  emailVerified: boolean;
  id: string;
  status: UserStatus;
  twoFactorEnabled: boolean;
  username: string;
};

async function getPackageVersion() {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    version?: string;
  };

  return packageJson.version ?? "0.0.0";
}

/**
 * Ş10 — Hakkında'nın `Öne çıkan katkıcı` rolü. Eski panel (`settings-panel.tsx`) aynı sabiti
 * kendi içinde taşıyordu; o dosya Ş13'te siliniyor ve rol bilgisi ekranın değil yükün parçası.
 *
 * TODO(api): `Contributor` tablosuna rol kolonu eklendiğinde bu sabit silinir ve rol veriden
 * okunur — adı değişen bir katkıcı bugün rolünü kaybediyor.
 */
export const FEATURED_CONTRIBUTOR_NAME = "Oğuz Güğümcüoğlu";

async function getContributors() {
  const contributors = await prisma.contributor.findMany({
    select: { name: true },
  });

  return contributors
    .map((contributor) => contributor.name)
    .sort((left, right) => left.localeCompare(right, "tr", { sensitivity: "base" }));
}

async function getPreferredReleaseChannel(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({
    select: { preferredReleaseChannel: true },
    where: { id: userId },
  });

  return row?.preferredReleaseChannel ?? null;
}

type SettingsBootstrapStaticDependencies = {
  readContributors(): Promise<string[]>;
  readPackageVersion(): Promise<string>;
  readPreferredReleaseChannel(userId: string): Promise<string | null>;
};

const defaultStaticDependencies: SettingsBootstrapStaticDependencies = {
  readContributors: getContributors,
  readPackageVersion: getPackageVersion,
  readPreferredReleaseChannel: getPreferredReleaseChannel,
};

let staticBuildInfoPromise: Promise<{ contributors: string[]; packageVersion: string }> | null =
  null;

function getStaticBuildInfo(dependencies: SettingsBootstrapStaticDependencies) {
  staticBuildInfoPromise ??= Promise.all([
    dependencies.readContributors(),
    dependencies.readPackageVersion(),
  ])
    .then(([contributors, packageVersion]) => ({ contributors, packageVersion }))
    .catch((error: unknown) => {
      // A transient disk/DB failure must not poison the process-lifetime memo.
      staticBuildInfoPromise = null;
      throw error;
    });

  return staticBuildInfoPromise;
}

export async function getSettingsBootstrapPayload(
  {
    locale,
    user,
  }: {
    locale?: string | null;
    user: SettingsBootstrapUser;
  },
  dependencies: SettingsBootstrapStaticDependencies = defaultStaticDependencies,
): Promise<SettingsBootstrapPayload> {
  const { contributors, packageVersion } = await getStaticBuildInfo(dependencies);
  /**
   * Ş10 — `h2` (Masaüstü › Güncelleme › Release kanalı) satırının ilk değeri.
   *
   * Çağıranların okuduğu kullanıcı nesnesine bir alan eklemek yerine burada sorulur: o nesne
   * üç sayfanın ortak yükü ve dört şerit aynı anda çalışıyor. Kolon boşsa `null` döner —
   * "tercih edilmemiş" ile "Kararlı" aynı şey değil.
   */
  const releasePreference = await dependencies.readPreferredReleaseChannel(user.id);
  const versionPayload = getWhisprVersionPayload();
  const formatterLocale = locale ?? "en";
  const lastUpdated = new Intl.DateTimeFormat(formatterLocale, {
    dateStyle: "long",
  }).format(new Date());
  const parsedBuildTime = versionPayload.buildTime ? new Date(versionPayload.buildTime) : null;
  const buildTime =
    parsedBuildTime && !Number.isNaN(parsedBuildTime.getTime())
      ? new Intl.DateTimeFormat(formatterLocale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(parsedBuildTime)
      : "";

  return {
    buildInfo: {
      buildId: versionPayload.buildId,
      buildTime,
      contributors,
      developerName: "Do\u011Fukan Yazar",
      featuredContributor: contributors.includes(FEATURED_CONTRIBUTOR_NAME)
        ? FEATURED_CONTRIBUTOR_NAME
        : null,
      lastUpdated,
      notes: versionPayload.notes,
      releaseChannel: versionPayload.releaseChannel,
      version: versionPayload.version || packageVersion,
    },
    preferredReleaseChannel: releasePreference,
    initialAccount: {
      avatarUrl: user.avatarUrl,
      displayName: user.displayName,
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      status: user.status,
      twoFactorEnabled: user.twoFactorEnabled,
      username: user.username,
    },
    uploadthingEnabled: Boolean(process.env.UPLOADTHING_TOKEN),
  };
}
