"use client";

import { createContext, useContext } from "react";

import type { ToastOptions } from "@/components/ui/toast";

/**
 * Toast'a erişim — Bahsedilmeler Ş8.
 *
 * Bağlam bu dosyada, sağlayıcı ayrı bir dosyada: sağlayıcı çizim yapıyor ve `framer-motion`
 * çekiyor. Bağlam onunla aynı modülde olsaydı, yalnız `show` çağıran bir sunucu bileşeni bile
 * bütün çizim ağacını paketine almak zorunda kalırdı.
 */

export type ToastApi = {
  readonly dismiss: (id: string) => void;
  /** Gösterilen toast'ın kimliğini döndürür — çağıran onu erkenden kapatabilsin diye. */
  readonly show: (options: ToastOptions) => string;
};

/**
 * Sağlayıcısız çağrı **sessizce yutulur**. Bir toast bir yan bildirimdir; sağlayıcı ağaçta yoksa
 * (ör. oturum dışı bir yüzey, ya da bir birim testi) ekranı çökertmesi gerekmez.
 */
const FALLBACK_TOAST_API: ToastApi = {
  dismiss: () => {},
  show: () => "",
};

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? FALLBACK_TOAST_API;
}

export type { ToastOptions, ToastTone } from "@/components/ui/toast";
