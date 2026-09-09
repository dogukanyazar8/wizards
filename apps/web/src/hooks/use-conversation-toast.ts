"use client";

import { useCallback, useEffect } from "react";
import type { ConversationToast, MessagesScreenAction } from "@wizards/types";

import { MESSAGES_METRICS } from "@/lib/messages/metrics";

/**
 * §17'nin toast şeridinin zamanlayıcısı — karar K13.
 *
 * Kanca durumu **tutmaz**: toast ekranın durum makinesinde yaşıyor (`showToast` /
 * `dismissToast`) ve ikinci bir kopya, sohbet değişince şeridi temizleyen reducer
 * kuralıyla (`openConversation` toast'ı düşürür) anında ayrışırdı. Buradaki tek iş
 * **zamanı** yönetmek: beş saniye sonra `dismissToast` ve söküldüğünde temizlik.
 */

export type ConversationToastTimers = {
  readonly clearTimer: (handle: number) => void;
  readonly startTimer: (callback: () => void, delayMs: number) => number;
};

/**
 * Gerçek zamanlayıcı.
 *
 * `unref` varsa çağrılır: Node ortamında (test koşusu, sunucu render'ı) askıda kalan
 * bir `setTimeout` süreci canlı tutar ve izole test koşusu `--test-force-exit`
 * olmadan hiç bitmez — Dalga 1'de tam olarak bu oldu. Tarayıcıda `unref` yoktur ve
 * kontrol sessizce atlanır.
 */
export const DEFAULT_CONVERSATION_TOAST_TIMERS: ConversationToastTimers = Object.freeze({
  clearTimer: (handle: number) => clearTimeout(handle),
  startTimer: (callback: () => void, delayMs: number) => {
    const handle: unknown = setTimeout(callback, delayMs);

    if (typeof handle === "object" && handle !== null && "unref" in handle) {
      (handle as { unref: () => void }).unref();
    }

    return handle as unknown as number;
  },
});

/**
 * Bir toast için otomatik kapanmayı kurar ve **temizleyicisini** döndürür.
 *
 * Saf: zamanlayıcı bir bağımlılıktan geliyor, yani sahte bir saatle sınanabiliyor.
 * `null` bir kayıt zamanlayıcı kurmaz — kapanmış bir şeridi kapatmak için beş saniye
 * bekleyen bir kayıt, sonraki toast'ın ömrünü de kısaltırdı.
 */
export function scheduleToastDismiss(
  toast: ConversationToast | null | undefined,
  dismiss: () => void,
  timers: ConversationToastTimers = DEFAULT_CONVERSATION_TOAST_TIMERS,
  delayMs: number = MESSAGES_METRICS.toast.autoCloseMs,
): () => void {
  if (!toast) {
    return () => undefined;
  }

  const handle = timers.startTimer(dismiss, delayMs);

  return () => timers.clearTimer(handle);
}

export type UseConversationToastOptions = {
  readonly dispatch: (action: MessagesScreenAction) => void;
  /** Test tohumu; üretimde gerçek zamanlayıcı kullanılır. */
  readonly timers?: ConversationToastTimers | undefined;
  /** Ekranın durum makinesindeki kayıt. */
  readonly toast: ConversationToast | null;
};

export type ConversationToastController = {
  readonly dismiss: () => void;
  readonly show: (toast: ConversationToast) => void;
  readonly toast: ConversationToast | null;
};

export function useConversationToast({
  dispatch,
  timers = DEFAULT_CONVERSATION_TOAST_TIMERS,
  toast,
}: UseConversationToastOptions): ConversationToastController {
  const dismiss = useCallback(() => dispatch({ type: "dismissToast" }), [dispatch]);
  const show = useCallback(
    (next: ConversationToast) => dispatch({ toast: next, type: "showToast" }),
    [dispatch],
  );

  /**
   * Bağımlılık **kaydın kendisi**: yeni bir toast eskisinin yerini aldığında efekt
   * yeniden koşar, eski zamanlayıcı temizlenir ve yeni şerit tam beş saniye yaşar.
   * Bağımlılık yalnız "toast var mı" olsaydı ikinci toast birincinin artakalan
   * süresini devralırdı.
   */
  useEffect(() => scheduleToastDismiss(toast, dismiss, timers), [dismiss, timers, toast]);

  return { dismiss, show, toast };
}
