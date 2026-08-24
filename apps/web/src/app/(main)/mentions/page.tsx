import { MentionsPage } from "@/components/mentions/mentions-page";

/**
 * `/mentions` — Bahsedilmeler (SPEC-BAHSEDILMELER §0).
 *
 * `(main)` grubunun layout'u oturumu ve ban kontrolünü **zaten** yapıyor; burada ikinci bir
 * `requireAuth` yok. Kabuğun 3. sütununu (bahsetme rayı) `selectThirdColumn` seçiyor (Ş1);
 * bu rota yalnız 4. sütunu — akış, bağlam paneli ve ayarlar modalı — çiziyor.
 *
 * Durum adres çubuğunda (`?filter=…&source=…&group=…&window=…&q=…&panel=…&modal=…`), o yüzden
 * sayfa istek başına çiziliyor.
 */
export const dynamic = "force-dynamic";

export default function MentionsRoute() {
  return <MentionsPage />;
}
