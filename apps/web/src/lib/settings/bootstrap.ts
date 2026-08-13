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

async function getContributors() {
  const contributors = await prisma.contributor.findMany({
    select: { name: true },
  });

  return contributors
    .map((contributor) => contributor.name)
    .sort((left, right) => left.localeCompare(right, "tr", { sensitivity: "base" }));
}

type SettingsBootstrapStaticDependencies = {
  readContributors(): Promise<string[]>;
  readPackageVersion(): Promise<string>;
};

const defaultStaticDependencies: SettingsBootstrapStaticDependencies = {
  readContributors: getContributors,
  readPackageVersion: getPackageVersion,
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
      lastUpdated,
      notes: versionPayload.notes,
      releaseChannel: versionPayload.releaseChannel,
      version: versionPayload.version || packageVersion,
    },
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
