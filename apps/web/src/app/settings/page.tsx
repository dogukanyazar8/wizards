import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@wizards/db";
import { redirect } from "next/navigation";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { getCurrentUser, requireAuth } from "@/lib/auth/utils";

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

  const [contributors, version] = await Promise.all([getContributors(), getPackageVersion()]);
  const lastUpdated = new Intl.DateTimeFormat(session.user.locale ?? "en", {
    dateStyle: "long",
  }).format(new Date());

  return (
    <SettingsPanel
      buildInfo={{
        contributors,
        developerName: "Doğukan Yazar",
        lastUpdated,
        version,
      }}
      initialAccount={{
        avatarUrl: user.avatarUrl,
        displayName: user.displayName,
        email: user.email,
        status: user.status,
        username: user.username,
      }}
    />
  );
}
