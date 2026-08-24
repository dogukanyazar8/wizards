import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUserForSession, requireAuth } from "@/lib/auth/utils";
import { LocaleSessionSync } from "@/components/locale/locale-session-sync";
import { ThemeSessionSync } from "@/components/theme/theme-session-sync";
import { AuthenticatedAppProviders } from "@/components/providers/authenticated-app-providers";
import { WizardsShell } from "@/components/shell/wizards-shell";

function getVisibleStatus(status: string | null | undefined) {
  if (status === "IDLE" || status === "DND" || status === "OFFLINE") {
    return status;
  }

  if (status === "INVISIBLE") {
    return "OFFLINE";
  }

  return "ONLINE";
}

export default async function MainLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth();
  const user = await getCurrentUserForSession(session);

  // A suspended account keeps exactly one destination: the page that explains
  // the decision and takes an appeal.
  if (user?.isBanned) {
    redirect("/suspended");
  }

  const displayName =
    user?.displayName ??
    session.user.displayName ??
    session.user.username ??
    session.user.email ??
    "Whispr";
  const username =
    user?.username ?? session.user.username ?? session.user.email?.split("@")[0] ?? "whispr";

  return (
    <AuthenticatedAppProviders
      currentUser={{
        id: session.user.id,
        avatarUrl: user?.avatarUrl ?? session.user.avatarUrl ?? session.user.image ?? null,
        displayName,
        username,
      }}
      uploadthingEnabled={Boolean(process.env.UPLOADTHING_TOKEN)}
    >
      <LocaleSessionSync preferredLocale={session.user.locale} />
      <ThemeSessionSync preferredTheme={session.user.theme} />
      <WizardsShell
        currentUser={{
          id: session.user.id,
          avatarUrl: user?.avatarUrl ?? session.user.avatarUrl ?? session.user.image ?? null,
          displayName,
          status: getVisibleStatus(user?.status),
          username,
        }}
        uploadthingEnabled={Boolean(process.env.UPLOADTHING_TOKEN)}
      >
        {children}
      </WizardsShell>
    </AuthenticatedAppProviders>
  );
}
