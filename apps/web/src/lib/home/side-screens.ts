import { AppAwaitingFilterSchema, type AppAwaitingFilter } from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 6. Gelen kutusunun adresten okuduğu tek karar.
 *
 * Ş10 — bu dosyanın etkinlik yarısı (görünüm parametresi ayrıştırıcısı, ay ızgarası, takvim
 * klavye gezinmesi, gün gruplayıcısı) **silindi**: eski `/events` liste + ay takvimi ekranı
 * kalktı. Yeni ekranın adres ayrıştırıcısı `lib/events/routes.ts`, hafta hesabı
 * `lib/events/week.ts`, gün kovaları sunucuda (`lib/events/events-service.ts`).
 */

/**
 * §9 — tanınmayan bir `?source=` listeye düşer. Paylaşılabilir bir adresteki görüntüleme
 * tercihidir, bir talimat değil: birisi yanlış yazdı diye çizmemeyi seçmek yanlış tür bir
 * katılık olurdu.
 */
export function parseInboxSource(value: string | null): AppAwaitingFilter {
  const parsed = AppAwaitingFilterSchema.safeParse(value);

  return parsed.success ? parsed.data : "all";
}
