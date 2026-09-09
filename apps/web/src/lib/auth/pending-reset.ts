/**
 * Şifremi unuttum → `Bağlantı gönderildi` ekranına taşınan durum.
 *
 * SPEC-GIRIS-KAYIT §4.7 gönderildi ekranında adresi gösteriyor ve yeniden gönderme kilidini
 * geri sayım pill'iyle sürüyor. İkisi de sorgu dizesine yazılamaz: adres kişisel veri, kalan süre
 * de paylaşılabilir bir bağlantıda anlamsız.
 *
 * `retryAfterMs` sunucudan gelen **kalan süredir**, bitiş zamanı değil; istemci saatine
 * güvenilmiyor. Ekran değerini alır almaz kendi mutlak bitişini kurar, böylece sekmeye geri
 * dönüldüğünde sayaç doğru kalır.
 */

const RESET_EMAIL_KEY = "whispr-pending-reset-email";
const RESET_UNTIL_KEY = "whispr-pending-reset-until";

export type PendingResetRequest = {
  email: string;
  retryAfterMs: number;
};

export function storePendingResetRequest(request: PendingResetRequest): void {
  try {
    window.sessionStorage.setItem(RESET_EMAIL_KEY, request.email);
    window.sessionStorage.setItem(
      RESET_UNTIL_KEY,
      String(Date.now() + Math.max(0, request.retryAfterMs)),
    );
  } catch {
    // Depolama kapalıysa ekran adresi bulamaz ve kullanıcıyı forma geri gönderir.
  }
}

export function readPendingResetRequest(): PendingResetRequest | null {
  try {
    const email = window.sessionStorage.getItem(RESET_EMAIL_KEY);

    if (!email) {
      return null;
    }

    const until = Number(window.sessionStorage.getItem(RESET_UNTIL_KEY) ?? "0");

    return {
      email,
      retryAfterMs: Number.isFinite(until) ? Math.max(0, until - Date.now()) : 0,
    };
  } catch {
    return null;
  }
}

export function clearPendingResetRequest(): void {
  try {
    window.sessionStorage.removeItem(RESET_EMAIL_KEY);
    window.sessionStorage.removeItem(RESET_UNTIL_KEY);
  } catch {
    // Temizlenemezse değerler sekme kapanınca düşer.
  }
}
