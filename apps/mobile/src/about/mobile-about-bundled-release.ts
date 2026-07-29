import type { MobileReleaseDetail } from "@wizards/types";

/**
 * The installed build's own release summary ships with the binary so the 1a
 * identity and whats-new cards never collapse while the remote catalog is
 * unavailable. A successful API response still replaces this fallback.
 */
const ECHO_RELEASE = {
  buildNumber: 8150,
  changeCount: 8,
  changes: [
    {
      detail: "Görünüm ayarlarından dört kademe; sohbet ve kanal metinleri birlikte ölçeklenir.",
      title: "Mesaj yazı boyutu",
      type: "new",
    },
    {
      detail: "Kayıt sırasında seviye göstergesi ve kaydırarak iptal.",
      title: "Sesli mesajlarda canlı dalga formu",
      type: "improved",
    },
    {
      detail: "Takip ettiğin başlıklara gelen yanıtlar artık sessiz kalmıyor.",
      title: "Thread bildirimleri düzeltildi",
      type: "fixed",
    },
    {
      title: "Kanal listesi %30 daha hızlı açılıyor",
      type: "improved",
    },
    {
      title: "Sohbet listesindeki okunmamış sayacı anlık güncelleniyor",
      type: "improved",
    },
    {
      title: "Görüntülü aramada bağlantı süresi kısaldı",
      type: "improved",
    },
    {
      title: "Sunucu sessize alma süresi bazı cihazlarda sıfırlanıyordu",
      type: "fixed",
    },
    {
      title: "Medya önizlemeleri bazı bağlantılarda açılmıyordu",
      type: "fixed",
    },
  ],
  codename: "Echo",
  installed: true,
  releasedAt: "2026-07-24T09:00:00.000Z",
  version: "0.8.15",
} satisfies MobileReleaseDetail;

const BUNDLED_RELEASES: Readonly<Record<string, MobileReleaseDetail>> = {
  [ECHO_RELEASE.version]: ECHO_RELEASE,
};

export function getBundledMobileRelease(version: string): MobileReleaseDetail | undefined {
  return BUNDLED_RELEASES[version];
}
