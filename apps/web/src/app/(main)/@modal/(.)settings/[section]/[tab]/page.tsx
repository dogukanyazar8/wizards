import { permanentRedirect, redirect } from "next/navigation";

import { SettingsWindowRoute } from "@/components/settings/settings-window-route";
import { getCurrentUserForSession, requireAuth } from "@/lib/auth/utils";
import { getSettingsBootstrapPayload } from "@/lib/settings/bootstrap";
import { buildSettingsHref, resolveSettingsRoute } from "@/lib/settings/navigation";

/**
 * `/settings/[section]/[tab]`'ın **yakalayıcı** kopyası (K2).
 *
 * Uygulama içinden gezinildiğinde kabuk yerinde kalır ve pencere onun üstüne modal olarak
 * biner; adres çubuğunda yine `/settings/...` yazar, yani bağlantı paylaşılabilir kalır.
 * Sayfayı yenilemek ya da bağlantıyı yeni sekmede açmak yakalamayı atlar ve
 * `app/settings/[section]/[tab]` tam ekran çizer — aynı bileşen, iki bağlam.
 *
 * Yuva `(main)` grubunun altında durur: `@modal` bir yol segmenti değildir, `(.)` bu yüzden
 * kök seviyeye bakar ve `/settings` yakalanır. Yuvayı `app/@modal` altına koymak, onu
 * `(main)/layout.tsx` yerine kök layout'un prop'u yapardı.
 */
export default async function InterceptedSettingsPage({
  params,
}: {
  params: Promise<{ section: string; tab: string }>;
}) {
  const { section, tab } = await params;
  const route = resolveSettingsRoute(section, tab);

  if (route.section !== section || route.tab !== tab) {
    permanentRedirect(buildSettingsHref(route.section, route.tab));
  }

  const session = await requireAuth();
  const user = await getCurrentUserForSession(session);

  if (!user) {
    redirect("/login");
  }

  const bootstrap = await getSettingsBootstrapPayload({ locale: session.user.locale, user });

  return <SettingsWindowRoute bootstrap={bootstrap} mode="modal" route={route} />;
}
