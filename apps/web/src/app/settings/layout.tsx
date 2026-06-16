import { AppStartupSessionMarker } from "@/components/app/app-startup-session-marker";
import { LocaleSessionSync } from "@/components/locale/locale-session-sync";
import { AuthenticatedAppProviders } from "@/components/providers/authenticated-app-providers";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";
import { ThemeSessionSync } from "@/components/theme/theme-session-sync";
import { requireAuth } from "@/lib/auth/utils";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const displayName =
    session.user.displayName ?? session.user.username ?? session.user.email ?? "Whispr";
  const username = session.user.username ?? session.user.email?.split("@")[0] ?? "whispr";

  return (
    <AuthenticatedAppProviders
      currentUser={{
        id: session.user.id,
        avatarUrl: session.user.avatarUrl ?? session.user.image ?? null,
        displayName,
        username,
      }}
    >
      <main
        className="app-shell h-dvh min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-6 md:px-6 lg:px-8"
        data-settings-scroll-root
      >
        <AppStartupSessionMarker />
        <LocaleSessionSync preferredLocale={session.user.locale} />
        <ThemeSessionSync preferredTheme={session.user.theme} />

        <div className="mx-auto grid w-full max-w-[1600px] min-w-0 gap-4 overflow-x-hidden sm:gap-6 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
          <SettingsSidebar />
          <section className="min-w-0 max-w-full overflow-x-hidden pb-8">{children}</section>
        </div>
      </main>
    </AuthenticatedAppProviders>
  );
}
