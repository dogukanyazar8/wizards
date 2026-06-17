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
        className="app-shell h-dvh min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-[radial-gradient(circle_at_16%_8%,hsl(var(--primary)/0.09),transparent_28%),radial-gradient(circle_at_86%_18%,hsl(var(--surface-highlight)/0.62),transparent_26%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--surface-base)))] px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-5 md:px-6 lg:px-5 lg:py-5 xl:px-7"
        data-settings-scroll-root
      >
        <AppStartupSessionMarker />
        <LocaleSessionSync preferredLocale={session.user.locale} />
        <ThemeSessionSync preferredTheme={session.user.theme} />

        <div className="mx-auto grid w-full max-w-[1760px] min-w-0 gap-4 overflow-x-hidden sm:gap-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
          <SettingsSidebar
            currentUser={{
              avatarUrl: session.user.avatarUrl ?? session.user.image ?? null,
              displayName,
              username,
            }}
          />
          <section className="min-w-0 max-w-full overflow-x-hidden pb-8 lg:pt-2">
            {children}
          </section>
        </div>
      </main>
    </AuthenticatedAppProviders>
  );
}
