import type { SplashStepId } from "@wizards/types";

import { SPLASH_FADE_OUT_MS } from "@wizards/types";

import {
  hideWhisprDesktopWindow,
  isWhisprDesktopAutostartLaunch,
  isWhisprDesktopRuntime,
  promoteWhisprDesktopWindow,
  showWhisprDesktopWindow,
} from "@/lib/desktop/runtime";

/**
 * Masaüstü açılışının tek pencere sözleşmesi — SPEC-SPLASH §4/§8.
 *
 * Açılış iki rotadan geçer (`/desktop/start` oturumu çözer, sonra kabuk yüklenir) ama
 * kullanıcı **tek bir pencere** ve **tek bir açılış ekranı** görmelidir. Bu modül o
 * sürekliliği taşır:
 *
 * - Pencere, kabuk hazır olana kadar 648 × 474'te kalır; büyütme (promotion) en sonda,
 *   açılış ekranı hâlâ üstteyken yapılır. Eskiden `/desktop/start` gezinmeden **önce**
 *   büyütüyordu: kullanıcı önce boş bir dev çerçeve, sonra baştan başlayan ikinci bir
 *   açılış ekranı görüyordu.
 * - Ulaşılan adım `sessionStorage`'da taşınır; kabuk listeye sıfırdan değil, kaldığı
 *   yerden devam eder. Tam sayfa yüklemesi (deep link, `location.replace`) React
 *   durumunu silse de bu hayatta kalır.
 *
 * Tüm okuma/yazmalar depolamasız tarayıcıda sessizce başarısız olur; masaüstü dışı
 * çalışma zamanında modül hiçbir şey yapmaz.
 */

const SCALE_CLASS = "whispr-splash-desktop-scale";
const PENDING_KEY = "whispr.desktop.startupPending";
const STEP_KEY = "whispr.desktop.startupStep";

const STEP_VALUES: readonly SplashStepId[] = ["connecting", "session", "servers", "almostReady"];

let promotionInFlight: Promise<boolean> | null = null;

/**
 * Açılış ekranını devralabilecek rotalar — kabuğun (`app/(main)`) yaşadığı yerler.
 *
 * Yalnız bunlar pencereyi küçük tutmaya değer: kabuk hazır olduğunu bildirebilir.
 * Başka bir hedefte (davet bağlantısı, yasal sayfa, giriş) beklenecek bir kabuk
 * yoktur; pencere gezinmeden önce ana ölçüye çıkar, yoksa kullanıcı içeriği
 * 648 × 474'lük bir kutuda görürdü.
 */
const SHELL_OWNED_DESKTOP_ROUTES = [
  "/channels",
  "/discover",
  "/events",
  "/home",
  "/mentions",
  "/messages",
  "/servers",
] as const;

export function isShellOwnedDesktopDestination(destination: string): boolean {
  const path = destination.split(/[?#]/)[0] ?? "";

  return SHELL_OWNED_DESKTOP_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readValue(key: string): string | null {
  try {
    return getSessionStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeValue(key: string, value: string) {
  try {
    getSessionStorage()?.setItem(key, value);
  } catch {
    // Depolama kapalıysa süreklilik kaybolur, açılış yine tamamlanır.
  }
}

function removeValue(key: string) {
  try {
    getSessionStorage()?.removeItem(key);
  } catch {
    // yukarıdaki gibi
  }
}

/** Küçük açılış penceresi hâlâ ayakta mı — yani terfi henüz yapılmadı mı. */
export function isDesktopStartupWindowPending(): boolean {
  return isWhisprDesktopRuntime() && readValue(PENDING_KEY) === "1";
}

/**
 * `/desktop/start` açıldığında çağrılır: pencere küçük, terfi kabuğa ait.
 * Masaüstü dışı çalışma zamanında hiçbir şey yazılmaz, aksi hâlde tarayıcıdaki
 * kabuk hiç bitmeyecek bir terfiyi beklerdi.
 */
export function markDesktopStartupWindowPending() {
  if (!isWhisprDesktopRuntime()) {
    return;
  }

  writeValue(PENDING_KEY, "1");
  applyDesktopStartupScale();
}

export function readDesktopStartupStep(): SplashStepId | null {
  const value = readValue(STEP_KEY);

  return STEP_VALUES.find((step) => step === value) ?? null;
}

/** Adım geri saymaz: yalnız ileri yazılır. */
export function writeDesktopStartupStep(step: SplashStepId) {
  if (!isWhisprDesktopRuntime()) {
    return;
  }

  const current = readDesktopStartupStep();

  if (current && STEP_VALUES.indexOf(current) >= STEP_VALUES.indexOf(step)) {
    return;
  }

  writeValue(STEP_KEY, step);
}

/**
 * Ölçek sınıfı: pencere 648 × 474 iken kök `zoom: 1.5` alır ve düzen tasarımın
 * 420 × 280 CSS ölçüsünde çizilir (K3). Terfiden sonra kaldırılır.
 */
export function applyDesktopStartupScale() {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.add(SCALE_CLASS);
}

export function clearDesktopStartupScale() {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.remove(SCALE_CLASS);
}

export function clearDesktopStartupHandoff() {
  removeValue(PENDING_KEY);
  removeValue(STEP_KEY);
  clearDesktopStartupScale();
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Açılışı bitirir — SPEC-SPLASH §8'in "splash kapanınca ana pencere gösterilir"
 * kuralının tek pencereli karşılığı.
 *
 * Sıra önemlidir ve hepsi **pencere gizliyken** olur:
 *
 * 1. pencereyi gizle,
 * 2. ana ölçüye büyüt,
 * 3. açılış ölçeğini ve devir kaydını temizle (kabuk artık tam ölçüde çizilir),
 * 4. `onPromoted` ile perdeyi kapat,
 * 5. sönme bitecek kadar bekle, pencereyi göster.
 *
 * Eskiden terfi pencere görünürken yapılıyordu: kullanıcı bir an için açılış kartının
 * dışında boş, saydam bir uygulama çerçevesi görüyordu. Pencere gizliyken yapılınca
 * yeniden boyutlanma, `zoom` kalkması ve kabuğun ilk çizimi hiç görünmez.
 *
 * Eşzamanlı çağrılar tek bir akışı paylaşır. Etkileşimli açılışta pencere yeniden gösterilir;
 * işletim sistemi autostart akışı ise kullanıcı tepsiden açana kadar gizli kalır.
 */
export function finishDesktopStartup(onPromoted?: () => void): Promise<boolean> {
  if (!isWhisprDesktopRuntime()) {
    clearDesktopStartupHandoff();
    onPromoted?.();
    return Promise.resolve(false);
  }

  promotionInFlight ??= (async () => {
    let promoted = false;

    try {
      await hideWhisprDesktopWindow();
      promoted = await promoteWhisprDesktopWindow();
    } catch {
      promoted = false;
    } finally {
      clearDesktopStartupHandoff();
      onPromoted?.();
    }

    await wait(SPLASH_FADE_OUT_MS + 80);
    if (!isWhisprDesktopAutostartLaunch()) {
      await showWhisprDesktopWindow();
    }

    return promoted;
  })();

  return promotionInFlight;
}
