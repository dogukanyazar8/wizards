import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { requireAuth } from "@/lib/auth/utils";
import { AppStartupSessionMarker } from "@/components/app/app-startup-session-marker";
import { LocaleSessionSync } from "@/components/locale/locale-session-sync";
import { ThemeSessionSync } from "@/components/theme/theme-session-sync";

async function requireAdminOrRedirect() {
  try {
    await requireAdminCapability("dashboard.read");
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      redirect("/channels");
    }

    throw error;
  }
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth();
  await requireAdminOrRedirect();

  return (
    <main className="app-shell min-h-dvh overflow-x-hidden px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-6 md:px-6 lg:px-8">
      <AppStartupSessionMarker />
      <LocaleSessionSync preferredLocale={session.user.locale} />
      <ThemeSessionSync preferredTheme={session.user.theme} />
      {children}
    </main>
  );
}
