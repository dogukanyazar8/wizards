import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/utils";
import { LocaleSessionSync } from "@/components/locale/locale-session-sync";
import { ThemeSessionSync } from "@/components/theme/theme-session-sync";
import { WizardsShell } from "@/components/shell/wizards-shell";
import { SocketProvider } from "@/components/providers/socket-provider";
import { VoiceProvider } from "@/components/providers/voice-provider";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth();
  const displayName =
    session.user.displayName ?? session.user.username ?? session.user.email ?? "Wizard";
  const username = session.user.username ?? session.user.email?.split("@")[0] ?? "wizard";

  return (
    <SocketProvider>
      <VoiceProvider
        currentUser={{
          id: session.user.id,
          avatarUrl: session.user.avatarUrl ?? session.user.image ?? null,
          displayName,
          username,
        }}
      >
        <LocaleSessionSync preferredLocale={session.user.locale} />
        <ThemeSessionSync preferredTheme={session.user.theme} />
        <WizardsShell
          currentUser={{
            id: session.user.id,
            avatarUrl: session.user.avatarUrl ?? session.user.image ?? null,
            displayName,
            username,
          }}
          uploadthingEnabled={Boolean(process.env.UPLOADTHING_TOKEN)}
        >
          {children}
        </WizardsShell>
      </VoiceProvider>
    </SocketProvider>
  );
}
