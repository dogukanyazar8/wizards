import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DESKTOP_PERMISSION_KEYS,
  DESKTOP_PERMISSION_TONE_TOKENS,
  UNKNOWN_DESKTOP_PERMISSIONS,
  isPrimaryDesktopPermissionAction,
  readDesktopPermissions,
  requestDesktopPermission,
  resolveDesktopPermissionActions,
  toDesktopPermissionTone,
  toNotifPermission,
} from "./permissions";

/** Ş10 — SPEC §5.5 İzinler. Beş satır, üç pil, gerçek kaynak. */

describe("izin satırları", () => {
  it("beş izin tasarımın sırasında", () => {
    assert.deepEqual(
      [...DESKTOP_PERMISSION_KEYS],
      ["notifications", "microphone", "camera", "screenShare", "globalShortcuts"],
    );
  });

  it("ton token adıdır, renk değil", () => {
    assert.deepEqual(DESKTOP_PERMISSION_TONE_TOKENS, {
      blocked: "--danger",
      granted: "--success",
      unverified: "--warning",
    });
  });

  it("`prompt` ve `unknown` aynı pile düşer, `denied` ayrı kalır", () => {
    assert.equal(toDesktopPermissionTone("granted"), "granted");
    assert.equal(toDesktopPermissionTone("denied"), "blocked");
    assert.equal(toDesktopPermissionTone("prompt"), "unverified");
    assert.equal(toDesktopPermissionTone("unknown"), "unverified");
  });

  it("bilinmeyen durum sorgulanamamaktır, reddedilmek değil", () => {
    assert.equal(toNotifPermission(undefined), "unknown");
    assert.equal(toNotifPermission("default"), "unknown");
    assert.equal(toNotifPermission("denied"), "denied");
  });
});

describe("duruma göre düğmeler (SPEC §5.5 tablosu)", () => {
  it("mikrofon ve kamera durumları izin veya sistem ayarlarına gider", () => {
    assert.deepEqual(resolveDesktopPermissionActions("microphone", "granted"), ["openSystem"]);
    assert.deepEqual(resolveDesktopPermissionActions("camera", "denied"), [
      "openSystem",
      "recheck",
    ]);
    assert.deepEqual(resolveDesktopPermissionActions("camera", "unknown"), ["request", "recheck"]);
    assert.equal(isPrimaryDesktopPermissionAction("granted", 0), false);
    assert.equal(isPrimaryDesktopPermissionAction("denied", 0), true);
    assert.equal(isPrimaryDesktopPermissionAction("denied", 1), false);
    assert.equal(isPrimaryDesktopPermissionAction("unknown", 0), true);
  });

  it("bildirim satırı gerçek test bildirimi ve sistem ayarları sunar", () => {
    assert.deepEqual(resolveDesktopPermissionActions("notifications", "granted"), [
      "testNotification",
      "openSystem",
    ]);
    assert.deepEqual(resolveDesktopPermissionActions("notifications", "unknown"), [
      "testNotification",
      "openSystem",
      "recheck",
    ]);
  });

  it("ekran paylaşımı kalıcı izin iddiası yerine gerçek seçiciyi test eder", () => {
    assert.deepEqual(resolveDesktopPermissionActions("screenShare", "prompt"), [
      "testScreenShare",
      "recheck",
    ]);
  });

  it("global kısayol satırı izin istemek yerine gerçek yöneticiyi açar", () => {
    assert.deepEqual(resolveDesktopPermissionActions("globalShortcuts", "unknown"), [
      "manageShortcuts",
      "recheck",
    ]);
    assert.deepEqual(resolveDesktopPermissionActions("globalShortcuts", "granted"), [
      "manageShortcuts",
    ]);
  });
});

describe("izin eylemleri", () => {
  it("ekran paylaşımı eylemi gerçek seçiciyi açar ve dönen izi kapatır", async () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    let stopped = false;

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getDisplayMedia: async () => ({
            getTracks: () => [{ stop: () => (stopped = true) }],
          }),
        },
      },
    });
    Reflect.deleteProperty(globalThis, "window");

    try {
      assert.equal(await requestDesktopPermission("screenShare"), "prompt");
      assert.equal(stopped, true);
    } finally {
      if (navigatorDescriptor) {
        Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "navigator");
      }

      if (windowDescriptor) {
        Object.defineProperty(globalThis, "window", windowDescriptor);
      }
    }
  });
});

describe("köprüsüz çalışma zamanı", () => {
  it("hiçbir izin uydurulmaz", () => {
    for (const key of DESKTOP_PERMISSION_KEYS) {
      assert.equal(UNKNOWN_DESKTOP_PERMISSIONS[key], "unknown");
    }
  });

  it("tarayıcı kaydı yokken okuma beş `unknown` döner", async () => {
    const permissions = await readDesktopPermissions();

    // `navigator.permissions` bu ortamda yok; kamera ve mikrofon sorgulanamaz, bildirim
    // `Notification` API'si olmadan okunamaz, iki masaüstü satırı köprüsüz kalır.
    assert.equal(permissions.camera, "unknown");
    assert.equal(permissions.microphone, "unknown");
    assert.equal(permissions.notifications, "unknown");
    assert.equal(permissions.globalShortcuts, "unknown");
  });
});
