import { AppStartupSessionMarker } from "@/components/app/app-startup-session-marker";
import { LocaleSessionSync } from "@/components/locale/locale-session-sync";
import { AuthenticatedAppProviders } from "@/components/providers/authenticated-app-providers";
import { ThemeSessionSync } from "@/components/theme/theme-session-sync";
import { requireAuth } from "@/lib/auth/utils";

/**
 * `/settings` ağacının kabuğu — Ş5 §1.
 *
 * Artık **hiçbir düzen çizmez**: pencere kendi çerçevesini taşıyor ve tam ekran kipinde
 * arkasında uygulama kabuğu yok. Eski `SettingsSidebar` + ızgara düzeni buradan kalktı (K1);
 * layout yalnız oturum, dil ve tema bağlamını kuruyor — `/settings/reauth/[token]` de aynı
 * bağlama ihtiyaç duyduğu için bu iş layout'ta kalır.
 */
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
      <AppStartupSessionMarker />
      <LocaleSessionSync preferredLocale={session.user.locale} />
      <ThemeSessionSync preferredTheme={session.user.theme} />
      {children}
    </AuthenticatedAppProviders>
  );
}
