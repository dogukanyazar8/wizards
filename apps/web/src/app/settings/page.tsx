import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@wizards/db";
import { redirect } from "next/navigation";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { getCurrentUser, requireAuth } from "@/lib/auth/utils";
import { getWhisprVersionPayload } from "@/lib/app-version";

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

export default async function SettingsPage() {
  const session = await requireAuth();
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [contributors, packageVersion] = await Promise.all([
    getContributors(),
    getPackageVersion(),
  ]);
  const versionPayload = getWhisprVersionPayload();
  const lastUpdated = new Intl.DateTimeFormat(session.user.locale ?? "en", {
    dateStyle: "long",
  }).format(new Date());
  const parsedBuildTime = versionPayload.buildTime
    ? new Date(versionPayload.buildTime)
    : null;
  const buildTime = parsedBuildTime && !Number.isNaN(parsedBuildTime.getTime())
    ? new Intl.DateTimeFormat(session.user.locale ?? "en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsedBuildTime)
    : "";

  return (
    <SettingsPanel
      buildInfo={{
        buildId: versionPayload.buildId,
        buildTime,
        contributors,
        developerName: "Do\u011Fukan Yazar",
        lastUpdated,
        notes: versionPayload.notes,
        releaseChannel: versionPayload.releaseChannel,
        version: versionPayload.version || packageVersion,
      }}
      initialAccount={{
        avatarUrl: user.avatarUrl,
        displayName: user.displayName,
        email: user.email,
        emailVerified: user.emailVerified,
        id: user.id,
        status: user.status,
        twoFactorEnabled: user.twoFactorEnabled,
        username: user.username,
      }}
      uploadthingEnabled={Boolean(process.env.UPLOADTHING_TOKEN)}
    />
  );
}
