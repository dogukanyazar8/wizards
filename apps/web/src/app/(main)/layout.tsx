import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/utils";
import { WizardsShell } from "@/components/shell/wizards-shell";
import { SocketProvider } from "@/components/providers/socket-provider";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth();
  const displayName =
    session.user.displayName ?? session.user.username ?? session.user.email ?? "Wizard";
  const username = session.user.username ?? session.user.email?.split("@")[0] ?? "wizard";

  return (
    <SocketProvider>
      <WizardsShell
        currentUser={{
          avatarUrl: session.user.avatarUrl ?? session.user.image ?? null,
          displayName,
          username,
        }}
        uploadthingEnabled={Boolean(process.env.UPLOADTHING_TOKEN)}
      >
        {children}
      </WizardsShell>
    </SocketProvider>
  );
}
