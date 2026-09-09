import { permanentRedirect, redirect } from "next/navigation";

import { SettingsWindowRoute } from "@/components/settings/settings-window-route";
import { getCurrentUserForSession, requireAuth } from "@/lib/auth/utils";
import { getSettingsBootstrapPayload } from "@/lib/settings/bootstrap";
import { buildSettingsHref, resolveSettingsRoute } from "@/lib/settings/navigation";

/**
 * `/settings/[section]/[tab]` — **gerçek** rota (K2).
 *
 * Doğrudan adresle açıldığında pencere kabuğun içinde değil, tam ekran çizilir: paylaşılan bir
 * `/settings/notifications/quiet-hours` bağlantısı doğru sekmeyi açar ve arkasında yükleyecek
 * bir kabuk taşımaz. Uygulama içinden gezinildiğinde `(main)/@modal/(.)settings/…` bu rotayı
 * yakalar ve aynı pencereyi kabuğun üstüne modal olarak koyar.
 *
 * Geçersiz segment 404 vermez, **kalıcı olarak** düzeltilir: bölüm doğruysa kullanıcının nereye
 * gitmek istediği bellidir, sekme yanlışsa bölümün ilk sekmesi açılır (`resolveSettingsRoute`).
 */
export default async function SettingsRoutePage({
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

  return <SettingsWindowRoute bootstrap={bootstrap} mode="page" route={route} />;
}
