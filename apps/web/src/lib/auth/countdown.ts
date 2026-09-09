/**
 * Geri sayım biçimlendirmesi — SPEC-GIRIS-KAYIT §4.5, §4.7, §7/2 ve §7/9.
 *
 * Tasarım dört yerde `mm:ss` gösteriyor: `Tekrar gönder · 00:42`, `Yeniden gönderme 00:58 sonra
 * açılır`, `Kalan süre 14:32`, `Yeni kod · 01:58`. Dördü de aynı biçimi kullanır, bu yüzden
 * biçimlendirme tek yerde durur.
 *
 * Sunucu **kalan süreyi** döndürür (`retryAfterMs`), bitiş zamanını değil: istemci saati yanlış
 * olsa bile sayaç doğru sayar.
 */

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / MS_PER_SECOND));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
