"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import { AuthSurfaceProvider } from "@/components/auth/auth-surface";
import { AUTH_THEME_ATTRIBUTE, resolveAuthTheme } from "@/lib/auth/auth-theme";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

/**
 * SPEC-GIRIS-KAYIT §5 — masaüstü ölçek kademesi.
 *
 * Masaüstünde marka paneli 512 → 376, form sütunu 384 → 352, başlık 29 → 25 ve alan yüksekliği
 * 46 → 43 iner. Bu kayma tek bir anahtardan sürülür: kök yüzeyi `desktop` olarak işaretler,
 * `buildAuthCssVars` sözlüğün masaüstü dalını basar, bileşenler yalnız sınıf kullanır.
 *
 * Bileşenlerin içinde `if (isDesktop)` **yok** — Ş7'nin sözleşmesi bu.
 *
 * Sunucu render'ında masaüstü olup olmadığı bilinmiyor; `useSyncExternalStore` sunucuda `web`
 * döndürüyor ve istemci ilk boyada gerçek yüzeyi koyuyor. Ölçüler CSS değişkeni olduğu için
 * geçiş yeniden düzen kurmuyor, yalnız değerler değişiyor.
 */

const subscribe = () => () => {};

export function AuthSurfaceGate({ children }: { children: ReactNode }) {
  const isDesktop = useSyncExternalStore(subscribe, isWhisprDesktopRuntime, () => false);

  /*
   * Emniyet kemeri: belge betiği yalnız tam sayfa yüklemede koşar. Kullanıcı ürünün içinden
   * `/login`'e geçtiyse öznitelik hiç yazılmamış olabilir; o durumda yüzey seçili koyu temayı
   * yok sayardı. Öznitelik zaten varsa dokunulmaz — ikinci bir yazma boyamayı tekrarlatır.
   */
  useEffect(() => {
    if (document.documentElement.hasAttribute(AUTH_THEME_ATTRIBUTE)) {
      return;
    }

    document.documentElement.setAttribute(AUTH_THEME_ATTRIBUTE, resolveAuthTheme());
  }, []);

  return (
    <AuthSurfaceProvider surface={isDesktop ? "desktop" : "web"}>{children}</AuthSurfaceProvider>
  );
}
