import { CHANNEL_SLOW_MODE_DELAYS } from "@wizards/types";

/**
 * SPEC-SUNUCU §8.3: sunucu geneli yavaş mod "kanal bazlı yavaş moddan bağımsız çalışır; iki
 * süre birlikte tanımlıysa **uzun olan** uygulanır".
 *
 * Kural tek bir yerde yaşasın diye burada: mesaj gönderme servisi (Ş1) bunu çağırır, kanal
 * penceresi ve `İçerik ve Mesajlaşma` bölümü aynı fonksiyonla "şu an geçerli süre" gösterir.
 * İki ayrı `Math.max` iki farklı bekleme süresi demek olurdu — biri kullanıcıya söylenen, biri
 * uygulanan.
 */
export function resolveEffectiveSlowMode(serverDelay: number, channelDelay: number): number {
  return Math.max(normalizeDelay(serverDelay), normalizeDelay(channelDelay));
}

/**
 * Negatif ve `NaN` değerleri 0'a indirir. Kolon `NOT NULL DEFAULT 0` olduğu için üretimde
 * beklenmez, ama `Math.max(NaN, 5)` `NaN` döner ve o `NaN` bir bekleme süresine dönüşürse
 * gönderim kutusu sessizce kilitlenirdi.
 */
function normalizeDelay(delay: number): number {
  return Number.isFinite(delay) && delay > 0 ? delay : 0;
}

/** Değerin çip grubunda karşılığı var mı? Sözleşmenin `refine`'ıyla aynı küme. */
export function isSupportedSlowMode(delay: number): boolean {
  return CHANNEL_SLOW_MODE_DELAYS.includes(delay as never);
}

/**
 * Etkin sürenin hangi kaynaktan geldiği — kanal penceresindeki "sunucu ayarı daha uzun"
 * ipucu bunu okur. Eşitlikte `channel` döner: kullanıcı kanalın kendi ayarını görüyor.
 */
export function resolveSlowModeSource(
  serverDelay: number,
  channelDelay: number,
): "none" | "channel" | "server" {
  const effective = resolveEffectiveSlowMode(serverDelay, channelDelay);

  if (effective === 0) {
    return "none";
  }

  return normalizeDelay(channelDelay) >= normalizeDelay(serverDelay) ? "channel" : "server";
}
