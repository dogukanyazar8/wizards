"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import {
  TOAST_TICK_MS,
  ToastViewport,
  createToastEntry,
  dismissToast,
  enqueueToast,
  tickToasts,
  type ToastEntry,
  type ToastOptions,
} from "@/components/ui/toast";
import { ToastContext, type ToastApi } from "@/hooks/use-toast";

/**
 * Toast yığınının sahibi — Bahsedilmeler Ş8.
 *
 * Bütün kuyruk kararları `ui/toast.tsx` içindeki saf fonksiyonlarda; burada yalnız **zaman**
 * var. Ayrım kasıtlı: "üçten fazlası kuyruğa girer" ya da "eylemli toast 10 saniye durur" gibi
 * kurallar bir zamanlayıcı beklemeden test edilebilmeli.
 *
 * Sayaç iki koşulda durur:
 *   - fare yığının üzerinde (`onPauseChange`),
 *   - pencere odak dışında ya da sekme gizli.
 * İkincisi `Geri al` için şart: başka bir sekmeye geçen kullanıcı geri döndüğünde geri alma
 * penceresini kapanmış bulmamalı.
 *
 * Aralık **yalnız** gösterilecek toast varken kurulur; boş yığında hiçbir zamanlayıcı dönmez.
 */

let toastSequence = 0;

function nextToastId(): string {
  toastSequence += 1;
  return `toast-${toastSequence}`;
}

export function ToastProvider({ children }: { readonly children: React.ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<readonly ToastEntry[]>([]);
  const [hovered, setHovered] = useState(false);
  const [windowActive, setWindowActive] = useState(true);
  // Zamanlayıcı geri çağrısı `toasts`e bağlanmasın diye: bağlanırsa her tick aralığı söküp
  // yeniden kurar ve kalan süre her seferinde bir adım kayar.
  const pausedRef = useRef(false);

  const paused = hovered || !windowActive;

  // Ref render sırasında yazılmaz (React Compiler `refs` kuralı); duraklatma bilgisi
  // zamanlayıcının okuduğu tek kanal ve efekt onu her değişimde tazeliyor.
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const update = () => {
      setWindowActive(!document.hidden && document.hasFocus());
    };

    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);

    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setToasts((current) => tickToasts(current, TOAST_TICK_MS, pausedRef.current));
    }, TOAST_TICK_MS);

    return () => window.clearInterval(interval);
  }, [toasts.length]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => dismissToast(current, id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const entry = createToastEntry(nextToastId(), options);
    setToasts((current) => enqueueToast(current, entry));
    return entry.id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ dismiss, show }), [dismiss, show]);

  const handleAct = useCallback(
    (entry: ToastEntry) => {
      // Önce kapat, sonra çalıştır: eylem yeni bir toast gösterirse (ör. geri alma sonucunu
      // bildiren bir toast) eskisi hâlâ yığında durmasın.
      dismiss(entry.id);
      entry.action?.onAct();
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport
        closeLabel={t("common.close")}
        onAct={handleAct}
        onDismiss={dismiss}
        onPauseChange={setHovered}
        toasts={toasts}
      />
    </ToastContext.Provider>
  );
}
