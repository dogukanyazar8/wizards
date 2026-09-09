import { permanentRedirect } from "next/navigation";

import { buildSettingsHref, resolveSettingsRoute } from "@/lib/settings/navigation";

/**
 * Sekmesiz bölüm adresi — `/settings/appearance` → `/settings/appearance/theme`.
 *
 * Silinen `app/settings/appearance/` sayfasının da düştüğü yer burasıdır (Ş5 §1): eski sayfa
 * `?section=appearance` sorgusuna yönlendiriyordu, o sorgu artık `/settings`'te göç ediyor ve
 * tek segmentlik bölüm adresi doğrudan ilk sekmeye açılıyor. Aksi hâlde `/settings/appearance`
 * iki segment bekleyen rotaya düşemez ve 404 verirdi.
 *
 * `reauth` statik segmenti bu dinamik segmentin **önünde** eşleşir; `/settings/reauth/<token>`
 * etkilenmez.
 */
export default async function SettingsSectionIndexPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const route = resolveSettingsRoute(section, null);

  permanentRedirect(buildSettingsHref(route.section, route.tab));
}
