"use client";

import type { DesktopPermissions, NotifPermission } from "@wizards/types";

import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

/**
 * Beş izin satırının okuma katmanı — Ayarlar paketi Dalga 3 / Ş10, SPEC §5.5 İzinler.
 *
 * Mikrofon ve kamera WebView izin kaydından; bildirim yerel işletim sistemi sorgusundan; ekran
 * paylaşımı platform yeteneğinden; global kısayol gerçek kayıt sonucundan gelir.
 *
 * **`unknown` bir eşanlamlı değildir.** `prompt` "kullanıcı henüz sorulmadı", `unknown`
 * "soramadık" demektir ve ikisi de ekranda `Doğrulanamadı` pilini alır — ama `denied` ile
 * karıştırılmaz. Global kısayol için Windows'ta ayrı izin yoktur; macOS'ta Erişilebilirlik
 * gerekebilir. Her iki durumda da güvenilir kanıt gerçek kayıt sonucudur. Hiç kayıt yoksa izin,
 * kapalı ayar ve tuş çakışması ayırt edilemediği için doğru varsayılan `unknown`'dır.
 *
 * `Kontrol et` düğmesi bu modülü **yeniden çağırır**. İyimser güncelleme yok: bir izin
 * durumunun değiştiğini ancak yeniden sorgu söyleyebilir.
 */

export const DESKTOP_PERMISSION_KEYS = [
  "notifications",
  "microphone",
  "camera",
  "screenShare",
  "globalShortcuts",
] as const;

export type DesktopPermissionKey = (typeof DESKTOP_PERMISSION_KEYS)[number];

/** SPEC §5.5 — üç pil. `prompt` ve `unknown` aynı pile düşer, aynı şey oldukları için değil. */
export type DesktopPermissionTone = "granted" | "blocked" | "unverified";

export const DESKTOP_PERMISSION_TONE_TOKENS: Readonly<Record<DesktopPermissionTone, string>> = {
  blocked: "--danger",
  granted: "--success",
  unverified: "--warning",
};

export function toDesktopPermissionTone(permission: NotifPermission): DesktopPermissionTone {
  if (permission === "granted") return "granted";
  if (permission === "denied") return "blocked";

  return "unverified";
}

/** Köprüsü olmayan çalışma zamanının doğru cevabı: hiçbir şey doğrulanamadı. */
export const UNKNOWN_DESKTOP_PERMISSIONS: DesktopPermissions = {
  camera: "unknown",
  globalShortcuts: "unknown",
  microphone: "unknown",
  notifications: "unknown",
  screenShare: "unknown",
};

type PermissionQueryName = "camera" | "microphone" | "notifications";

const PERMISSION_QUERY_NAMES: Readonly<Record<PermissionQueryName, string>> = {
  camera: "camera",
  microphone: "microphone",
  notifications: "notifications",
};

export function toNotifPermission(state: string | null | undefined): NotifPermission {
  switch (state) {
    case "granted":
      return "granted";
    case "denied":
      return "denied";
    case "prompt":
      return "prompt";
    default:
      return "unknown";
  }
}

async function queryBrowserPermission(name: PermissionQueryName): Promise<NotifPermission> {
  if (typeof navigator === "undefined" || !("permissions" in navigator)) {
    // Bildirim izni `navigator.permissions` olmadan da okunabilir; diğer ikisi okunamaz.
    return name === "notifications" ? readNotificationPermission() : "unknown";
  }

  try {
    const status = await navigator.permissions.query({
      name: PERMISSION_QUERY_NAMES[name] as PermissionName,
    });

    return toNotifPermission(status.state);
  } catch {
    return name === "notifications" ? readNotificationPermission() : "unknown";
  }
}

function readNotificationPermission(): NotifPermission {
  if (isWhisprDesktopRuntime()) {
    return "unknown";
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unknown";
  }

  return toNotifPermission(window.Notification.permission);
}

async function readNativeNotificationPermission(): Promise<NotifPermission> {
  try {
    const { nativeSettingsClient } = await import("@/lib/desktop/settings-client");
    return toNotifPermission(await nativeSettingsClient.notificationPermission());
  } catch {
    return "unknown";
  }
}

/**
 * Ekran paylaşımı izni.
 *
 * `navigator.permissions` bunu hiçbir tarayıcıda vermiyor; masaüstünde köprünün yetenek
 * raporundan okunur. `available` izin **verilmiş** demek değil, "bu platformda mümkün"
 * demektir — o yüzden en fazla `prompt` yazılır.
 */
async function readScreenSharePermission(): Promise<NotifPermission> {
  if (!isWhisprDesktopRuntime()) {
    return typeof navigator !== "undefined" && "mediaDevices" in navigator ? "prompt" : "unknown";
  }

  try {
    const { getDesktopPlatformCapabilities } = await import("@/lib/desktop/controls");
    const capabilities = await getDesktopPlatformCapabilities();

    if (!capabilities) {
      return "unknown";
    }

    switch (capabilities.nativeScreenCapture.status) {
      case "available":
        return "prompt";
      case "unsupported":
        return "denied";
      default:
        return "unknown";
    }
  } catch {
    return "unknown";
  }
}

/**
 * Global kısayol izni.
 *
 * Sorgulanabilir bir iznin karşılığı yok. Elde olan tek gerçek kayıt sonucudur: kabuk en az bir
 * kısayolu **gerçekten** kaydedebildiyse erişilebilirlik izni vardır. Hiçbiri kaydolmadıysa
 * bunun sebebi izin de olabilir, çakışma da — o yüzden `denied` değil `unknown`.
 */
async function readGlobalShortcutPermission(): Promise<NotifPermission> {
  if (!isWhisprDesktopRuntime()) {
    return "unknown";
  }

  try {
    const { readDesktopShortcutStatus } = await import("@/lib/desktop/shortcuts");
    const entries = await readDesktopShortcutStatus();

    if (entries?.entries.some((entry) => entry.registered)) {
      return "granted";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Beş izni **birlikte** okur; `Kontrol et` her basışta bunu yeniden çağırır. */
export async function readDesktopPermissions(): Promise<DesktopPermissions> {
  const [notifications, microphone, camera, screenShare, globalShortcuts] = await Promise.all([
    readDesktopPermission("notifications"),
    queryBrowserPermission("microphone"),
    queryBrowserPermission("camera"),
    readScreenSharePermission(),
    readGlobalShortcutPermission(),
  ]);

  return { camera, globalShortcuts, microphone, notifications, screenShare };
}

/** Tek satırın yeniden sorgusu — ızgara ile satır aynı okuyucuyu kullanır. */
export async function readDesktopPermission(key: DesktopPermissionKey): Promise<NotifPermission> {
  switch (key) {
    case "camera":
    case "microphone":
      return queryBrowserPermission(key);
    case "notifications":
      return isWhisprDesktopRuntime()
        ? readNativeNotificationPermission()
        : queryBrowserPermission(key);
    case "screenShare":
      return readScreenSharePermission();
    case "globalShortcuts":
      return readGlobalShortcutPermission();
  }
}

/** İzin veya doğrulama eylemi. Eylem anahtara göre gerçek platform davranışını çalıştırır. */
export async function requestDesktopPermission(
  key: DesktopPermissionKey,
): Promise<NotifPermission> {
  if (key === "notifications") {
    if (isWhisprDesktopRuntime()) {
      const { nativeSettingsClient } = await import("@/lib/desktop/settings-client");
      await nativeSettingsClient.notification();
      // Read the OS again; submission alone is not proof of permission.
      return readNativeNotificationPermission();
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unknown";
    }

    try {
      return toNotifPermission(await window.Notification.requestPermission());
    } catch {
      return "unknown";
    }
  }

  if (key === "camera" || key === "microphone") {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return "unknown";
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        key === "camera" ? { video: true } : { audio: true },
      );

      for (const track of stream.getTracks()) {
        track.stop();
      }

      return "granted";
    } catch {
      // İptal ile ret ayırt edilemez; satır gerçek durumu yeniden sorarak öğrenir.
      return readDesktopPermission(key);
    }
  }

  if (key === "screenShare") {
    if (isWhisprDesktopRuntime()) {
      const { nativeSettingsClient } = await import("@/lib/desktop/settings-client");
      await nativeSettingsClient.screenCaptureTest();
      return "prompt"; // A selection never grants permanent capture access.
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      return "unknown";
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });

      for (const track of stream.getTracks()) {
        track.stop();
      }
    } catch {
      // Seçiciyi kapatmak kalıcı ret değildir; WebView bu izni kalıcı olarak sorgulatmaz.
    }

    return readDesktopPermission(key);
  }

  return readDesktopPermission(key);
}

/** Windows izin sayfasını; karşılığı yoksa güvenilir yerel Desktop Control bölümünü açar. */
export async function openDesktopSystemSettings(key: DesktopPermissionKey): Promise<boolean> {
  if (!isWhisprDesktopRuntime()) {
    return false;
  }

  try {
    const { openDesktopControl, openDesktopPermissionSettings } =
      await import("@/lib/desktop/controls");

    if (key === "globalShortcuts") {
      return await openDesktopControl("shortcuts");
    }

    if (key === "notifications" || key === "microphone" || key === "camera") {
      try {
        if (await openDesktopPermissionSettings(key)) {
          return true;
        }
      } catch {
        // Eski kabuk komutu tanımıyorsa yerel izin rehberine düş.
      }
    }

    return await openDesktopControl("permissions");
  } catch {
    return false;
  }
}

/** A single direct action. Ephemeral capture access must never appear permanently granted. */
export function resolvePermissionControl(
  key: DesktopPermissionKey,
  permission: NotifPermission,
  desktop: boolean,
): {
  action: "done" | "request" | "system" | "recheck";
  labelKey: string;
} {
  if (permission === "granted" && key !== "screenShare")
    return { action: "done", labelKey: "settings.permission.granted" };
  if (key === "globalShortcuts")
    return {
      action: desktop ? "system" : "recheck",
      labelKey: desktop
        ? "settings.block.perms.action.manageShortcuts"
        : "settings.block.perms.action.recheck",
    };
  if (key === "screenShare" && desktop)
    return { action: "request", labelKey: "settings.permission.chooseScreen" };
  if (permission === "denied")
    return {
      action: desktop ? "system" : "recheck",
      labelKey: desktop
        ? "settings.block.perms.action.openSystem"
        : "settings.block.perms.action.recheck",
    };
  if (key === "notifications" && desktop)
    return permission === "prompt"
      ? { action: "request", labelKey: "settings.permission.enableNotifications" }
      : { action: "recheck", labelKey: "settings.block.perms.action.recheck" };
  return {
    action: "request",
    labelKey:
      key === "screenShare"
        ? "settings.permission.chooseScreen"
        : "settings.block.perms.action.request",
  };
}
