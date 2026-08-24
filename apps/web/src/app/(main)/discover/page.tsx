import { DiscoverPage } from "@/components/discover/discover-page";

/**
 * `/discover` — Keşfet (SPEC-KESFET §1–§8).
 *
 * `(main)` layout'u oturumu ve ban kontrolünü zaten yapıyor; ikinci `requireAuth` yok. Dizin
 * kolonu kabuğun üçüncü sütununda seçilir; bu rota akış, profil paneli ve modal yüzeyini çizer.
 * Durum adres çubuğunda olduğu için sayfa istek başına çizilir.
 */
export const dynamic = "force-dynamic";

export default function DiscoverRoute() {
  return <DiscoverPage />;
}
