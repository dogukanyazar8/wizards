import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { adminRoleHasCapability, requireAdminCapability } from "@/lib/admin/capabilities";
import { countOpenModerationCases } from "@/lib/moderation/case-queries";
import { requireAuth } from "@/lib/auth/utils";
import { AppStartupSessionMarker } from "@/components/app/app-startup-session-marker";
import { AdminShell } from "@/components/admin/kit/admin-shell";
import { LocaleSessionSync } from "@/components/locale/locale-session-sync";
import { ThemeSessionSync } from "@/components/theme/theme-session-sync";

async function requireAdminOrRedirect() {
  try {
    return await requireAdminCapability("dashboard.read");
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      redirect("/channels");
    }

    throw error;
  }
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [session, admin] = await Promise.all([requireAuth(), requireAdminOrRedirect()]);
  // Only roles that can open the queue pay for its count.
  const openCases = adminRoleHasCapability(admin.role, "case.read")
    ? await countOpenModerationCases()
    : 0;

  return (
    <AdminShell admin={admin} badges={{ moderation: openCases }}>
      <AppStartupSessionMarker />
      <LocaleSessionSync preferredLocale={session.user.locale} />
      <ThemeSessionSync preferredTheme={session.user.theme} />
      {children}
    </AdminShell>
  );
}
