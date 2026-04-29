import { LocaleSessionSync } from "@/components/locale/locale-session-sync";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";
import { ThemeSessionSync } from "@/components/theme/theme-session-sync";
import { requireAuth } from "@/lib/auth/utils";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <main className="app-shell min-h-screen px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-6 md:px-6 lg:px-8">
      <LocaleSessionSync preferredLocale={session.user.locale} />
      <ThemeSessionSync preferredTheme={session.user.theme} />

      <div className="mx-auto grid w-full max-w-[1600px] gap-4 sm:gap-6 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
        <SettingsSidebar />
        <section className="min-w-0 pb-8">{children}</section>
      </div>
    </main>
  );
}
