import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/utils";
import { WizardsShell } from "@/components/shell/wizards-shell";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth();
  const displayName =
    session.user.displayName ?? session.user.username ?? session.user.email ?? "Wizard";
  const username = session.user.username ?? session.user.email?.split("@")[0] ?? "wizard";

  return (
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
  );
}
