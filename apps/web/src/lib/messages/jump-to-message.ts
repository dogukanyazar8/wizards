"use client";

/**
 * Bir arama sonucundan mesaja atlama.
 *
 * Davranış `chat-area.tsx`'in içinde yaşıyordu; SPEC-SUNUCU §4.3'ün arama paneli sağ kolona
 * taşınınca ikinci bir çağıran doğdu ve `chat-area`'nın yerel `useCallback`'i oraya
 * ulaşmıyordu. İki kopya, iki farklı vurgulama süresi ve iki farklı `message` parametresi
 * demek olurdu.
 *
 * Fonksiyon durum tutmaz: adres çubuğuna `?message=<id>` yazar (mesaj listesinin kendi
 * `popstate` dinleyicisi bunu okuyup satırı yükler) ve satır zaten DOM'daysa ona kaydırıp
 * kısa süreli vurgular.
 */

const JUMP_HIGHLIGHT_MS = 1400;

export function jumpToMessageInDocument(messageId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("message", messageId);
  window.history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));

  const target = document.querySelector(`[data-message-id="${messageId}"]`);
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.dataset.jumpHighlight = "true";
    window.setTimeout(() => {
      delete target.dataset.jumpHighlight;
    }, JUMP_HIGHLIGHT_MS);
  }
}
