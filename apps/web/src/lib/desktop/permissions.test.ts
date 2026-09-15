import assert from "node:assert/strict";
import { nativeSettingsClient } from "./settings-client";
import { describe, it } from "node:test";

import {
  DESKTOP_PERMISSION_KEYS,
  DESKTOP_PERMISSION_TONE_TOKENS,
  UNKNOWN_DESKTOP_PERMISSIONS,
  readDesktopPermissions,
  readDesktopPermission,
  resolvePermissionControl,
  requestDesktopPermission,
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

it("desktop notifications use guarded native submission and never ask the browser", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const notification = nativeSettingsClient.notification;
  let nativeCalls = 0;
  let browserCalls = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __WHISPR_DESKTOP__: { shell: "desktop" },
      Notification: {
        requestPermission: () => {
          browserCalls++;
          return Promise.resolve("granted");
        },
      },
    },
  });
  nativeSettingsClient.notification = async () => {
    nativeCalls++;
    return { message: "submitted" };
  };
  try {
    assert.equal(await requestDesktopPermission("notifications"), "unknown");
    assert.equal(nativeCalls, 1);
    assert.equal(browserCalls, 0);
    nativeSettingsClient.notification = async () => {
      throw new Error("native unavailable");
    };
    await assert.rejects(requestDesktopPermission("notifications"), /native unavailable/);
    assert.equal(browserCalls, 0, "native failure must not fall back to browser permission");
  } finally {
    nativeSettingsClient.notification = notification;
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

it("web notification permission uses the actual browser answer", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      Notification: { requestPermission: async () => "denied" },
    },
  });
  try {
    assert.equal(await requestDesktopPermission("notifications"), "denied");
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

it("camera and microphone permission tests stop every captured track", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const constraints: MediaStreamConstraints[] = [];
  let stopped = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async (value: MediaStreamConstraints) => {
          constraints.push(value);
          return { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] };
        },
      },
    },
  });
  try {
    assert.equal(await requestDesktopPermission("camera"), "granted");
    assert.equal(await requestDesktopPermission("microphone"), "granted");
    assert.deepEqual(constraints, [{ video: true }, { audio: true }]);
    assert.equal(stopped, 4);
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});

it("native notification state never reads the WebView permission", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const read = nativeSettingsClient.notificationPermission;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __WHISPR_DESKTOP__: { shell: "desktop" },
      get Notification() {
        throw new Error("WebView permission is not native permission");
      },
    },
  });
  try {
    for (const permission of ["granted", "denied", "unknown"] as const) {
      nativeSettingsClient.notificationPermission = async () => permission;
      assert.equal(await readDesktopPermission("notifications"), permission);
    }
    nativeSettingsClient.notificationPermission = async () => {
      throw new Error("unavailable");
    };
    assert.equal(await readDesktopPermission("notifications"), "unknown");
  } finally {
    nativeSettingsClient.notificationPermission = read;
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

it("confirmed permissions are completed; ephemeral screen capture always asks for a source", () => {
  for (const desktop of [true, false]) {
    for (const key of ["camera", "microphone", "notifications", "globalShortcuts"] as const) {
      assert.deepEqual(resolvePermissionControl(key, "granted", desktop), {
        action: "done",
        labelKey: "settings.permission.granted",
      });
    }
    assert.equal(resolvePermissionControl("screenShare", "granted", desktop).action, "request");
    assert.equal(resolvePermissionControl("camera", "prompt", desktop).action, "request");
    assert.equal(
      resolvePermissionControl("camera", "denied", desktop).action,
      desktop ? "system" : "recheck",
    );
  }
  assert.equal(resolvePermissionControl("notifications", "unknown", true).action, "recheck");
  assert.equal(resolvePermissionControl("notifications", "denied", true).action, "system");
});

it("initial native notification activation reads the actual result after submission", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalRead = nativeSettingsClient.notificationPermission;
  const originalSend = nativeSettingsClient.notification;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { __WHISPR_DESKTOP__: { shell: "desktop" } },
  });
  const order: string[] = [];
  nativeSettingsClient.notification = async () => {
    order.push("send");
    return { message: "submitted" };
  };
  nativeSettingsClient.notificationPermission = async () => {
    order.push("read");
    return "granted";
  };
  try {
    assert.equal(resolvePermissionControl("notifications", "prompt", true).action, "request");
    assert.equal(await requestDesktopPermission("notifications"), "granted");
    assert.deepEqual(order, ["send", "read"]);
  } finally {
    nativeSettingsClient.notification = originalSend;
    nativeSettingsClient.notificationPermission = originalRead;
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

it("native screen consent never invokes the browser chooser or claims permanent access", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const original = nativeSettingsClient.screenCaptureTest;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { __WHISPR_DESKTOP__: { shell: "desktop" } },
  });
  let calls = 0;
  nativeSettingsClient.screenCaptureTest = async () => {
    calls++;
    return true;
  };
  try {
    assert.equal(await requestDesktopPermission("screenShare"), "prompt");
    assert.equal(calls, 1);
    nativeSettingsClient.screenCaptureTest = async () => {
      throw new Error("native unavailable");
    };
    await assert.rejects(requestDesktopPermission("screenShare"), /native unavailable/);
  } finally {
    nativeSettingsClient.screenCaptureTest = original;
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
