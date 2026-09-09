/**
 * Auth yüzeyinin açık/koyu anahtarı — paket kararı K6.
 *
 * SPEC-GIRIS-KAYIT §3.4'ün iki segmentli anahtarı yalnız **giriş ekranlarının** görünümünü
 * çevirir. Ürünün 20+ teması var ve kullanıcının kendi tercihi oturum açılınca devralıyor;
 * giriş ekranındaki bir dokunuş o tercihi sessizce silmemeli.
 *
 * Öznitelik `<html>` üstünde durur, çünkü ilk boyada (hidratasyondan önce) yazılması gerekiyor —
 * aksi hâlde koyu tema seçili bir kullanıcı her açılışta bir kare beyaz görürdü.
 */

export const AUTH_THEME_STORAGE_KEY = "whispr-auth-theme";
export const AUTH_THEME_ATTRIBUTE = "data-auth-theme";

export type AuthThemeMode = "dark" | "light";

export function normalizeAuthTheme(value: unknown): AuthThemeMode | null {
  return value === "dark" || value === "light" ? value : null;
}

export function readStoredAuthTheme(): AuthThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizeAuthTheme(window.localStorage.getItem(AUTH_THEME_STORAGE_KEY));
  } catch {
    // Depolama kapalı olabilir (gizli sekme, kurum politikası); tema yine de çalışmalı.
    return null;
  }
}

export function getSystemAuthTheme(): AuthThemeMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveAuthTheme(): AuthThemeMode {
  return readStoredAuthTheme() ?? getSystemAuthTheme();
}

export function applyAuthTheme(mode: AuthThemeMode): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(AUTH_THEME_ATTRIBUTE, mode);
  }

  try {
    window.localStorage.setItem(AUTH_THEME_STORAGE_KEY, mode);
  } catch {
    // Kalıcılık yoksa seçim yalnız bu sekmede yaşar; ekran çalışmaya devam eder.
  }
}

/**
 * İlk boyada özniteliği koyan senkron betik. `(auth)` düzeni bunu `<script>` içine basar;
 * hidratasyondan önce koştuğu için tema yanıp sönmez.
 */
export const AUTH_THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(
  AUTH_THEME_STORAGE_KEY,
)};var v=window.localStorage.getItem(k);if(v!=="dark"&&v!=="light"){v=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute(${JSON.stringify(
  AUTH_THEME_ATTRIBUTE,
)},v);}catch(e){}})();`;
