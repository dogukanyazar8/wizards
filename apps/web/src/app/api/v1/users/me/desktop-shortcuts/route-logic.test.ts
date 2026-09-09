import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS } from "@/lib/desktop/shortcuts";

import {
  desktopShortcutsGetRoute,
  desktopShortcutsPatchRoute,
  type DesktopShortcutsRouteDependencies,
} from "./route-logic";

/** Ş10 · K7 — atamalar sunucuda, çakışma değil. */

function makeDependencies(
  overrides: Partial<DesktopShortcutsRouteDependencies> = {},
): DesktopShortcutsRouteDependencies & { written: unknown[] } {
  const written: unknown[] = [];

  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => {},
    readAssignments: async () => null,
    writeAssignments: async (_userId, assignments) => {
      written.push(assignments);
    },
    written,
    ...overrides,
  };
}

function patchRequest(body: unknown) {
  return new Request("https://whispr.test/api/v1/users/me/desktop-shortcuts", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

describe("GET /api/v1/users/me/desktop-shortcuts", () => {
  it("kolon boşken beş varsayılanı döner", async () => {
    const response = await desktopShortcutsGetRoute(undefined, makeDependencies());
    const payload = (await response.json()) as { shortcuts: Record<string, string> };

    assert.equal(response.status, 200);
    assert.deepEqual(payload.shortcuts, DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS);
  });

  it("yanıt önbelleğe alınmaz", async () => {
    const response = await desktopShortcutsGetRoute(undefined, makeDependencies());

    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });

  it("kolondaki tanınmayan anahtar dışarı sızmaz", async () => {
    const dependencies = makeDependencies({
      readAssignments: async () => ({ nope: "Alt+Z", toggleMute: "Control+Alt+1" }),
    });

    const response = await desktopShortcutsGetRoute(undefined, dependencies);
    const payload = (await response.json()) as { shortcuts: Record<string, string> };

    assert.equal(payload.shortcuts.toggleMute, "Control+Alt+1");
    assert.equal("nope" in payload.shortcuts, false);
    assert.equal(Object.keys(payload.shortcuts).length, 5);
  });

  it("kimlik doğrulanmadan hiçbir şey okunmaz", async () => {
    let read = false;
    const dependencies = makeDependencies({
      authenticate: async () => {
        throw new Error("no session");
      },
      readAssignments: async () => {
        read = true;
        return null;
      },
    });

    const response = await desktopShortcutsGetRoute(undefined, dependencies);

    assert.equal(read, false);
    assert.ok(response.status >= 400);
  });
});

describe("PATCH /api/v1/users/me/desktop-shortcuts", () => {
  it("geçerli atama saklanır ve tamamı geri döner", async () => {
    const dependencies = makeDependencies();
    const response = await desktopShortcutsPatchRoute(
      patchRequest({ shortcuts: { hideOverlay: "Control+Alt+H" } }),
      dependencies,
    );
    const payload = (await response.json()) as { shortcuts: Record<string, string> };

    assert.equal(response.status, 200);
    assert.equal(payload.shortcuts.hideOverlay, "Control+Alt+H");
    assert.deepEqual(dependencies.written, [payload.shortcuts]);
  });

  it("geçersiz kombinasyon 400 vermez, varsayılana döner", () => {
    // Bir kısayolun bu makinede boşta olup olmadığını uç bilemez; tek bildiği kombinasyonun
    // kabuk tarafından hiç ayrıştırılamayacağı. O durumda satırı reddetmek yerine varsayılana
    // döndürmek, kullanıcıyı kayıtsız bir eylemle bırakmamak demek.
    return desktopShortcutsPatchRoute(
      patchRequest({ shortcuts: { pushToTalk: "Alt+Space" } }),
      makeDependencies(),
    ).then(async (response) => {
      const payload = (await response.json()) as { shortcuts: Record<string, string> };

      assert.equal(response.status, 200);
      assert.equal(payload.shortcuts.pushToTalk, DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS.pushToTalk);
    });
  });

  it("çakışma gövdesi kabul edilmez — saklanan yalnız atamalardır", async () => {
    const dependencies = makeDependencies();

    await desktopShortcutsPatchRoute(
      patchRequest({ shortcuts: { conflict: true, toggleMute: "Alt+M" } }),
      dependencies,
    );

    const stored = dependencies.written[0] as Record<string, unknown>;

    assert.equal("conflict" in stored, false);
    assert.deepEqual(Object.keys(stored).sort(), [
      "hideOverlay",
      "moderationConsole",
      "pushToTalk",
      "toggleDeafen",
      "toggleMute",
    ]);
  });

  it("gövdesiz istek 400 verir ve hiçbir şey yazılmaz", async () => {
    const dependencies = makeDependencies();
    const response = await desktopShortcutsPatchRoute(
      new Request("https://whispr.test/api/v1/users/me/desktop-shortcuts", { method: "PATCH" }),
      dependencies,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(dependencies.written, []);
  });

  it("bütçe aşılırsa yazma denenmez", async () => {
    const dependencies = makeDependencies({
      enforceRateLimit: async () => {
        throw new Error("rate limited");
      },
    });

    const response = await desktopShortcutsPatchRoute(
      patchRequest({ shortcuts: { toggleMute: "Alt+M" } }),
      dependencies,
    );

    assert.ok(response.status >= 400);
    assert.deepEqual(dependencies.written, []);
  });
});
