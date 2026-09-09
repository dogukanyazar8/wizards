import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

/**
 * SPEC-SPLASH §4/§8 — masaüstü açılışının tek pencere sözleşmesi.
 *
 * Ölçülen şey: küçük pencere işareti yalnız masaüstünde konur, devredilen adım geri
 * saymaz, ve açılış bittiğinde hem işaret hem ölçek sınıfı temizlenir. Bunlar
 * bozulursa kullanıcı ya iki açılış ekranı görür ya da tarayıcıda hiç bitmeyen bir
 * perdede kalır.
 */

/** Modülün dokunduğu üç yöntem; `Storage`ın tamamını taklit etmeye gerek yok. */
function createFakeStorage() {
  const entries = new Map<string, string>();

  return {
    getItem: (key: string) => entries.get(key) ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

/*
 * Node test koşucusunda DOM yok; modülün dokunduğu iki genel değişken elle kurulur.
 * `unknown` üzerinden atanır çünkü sahte nesneler `Window`/`Document`ın tamamını
 * değil, yalnız kullanılan yöntemleri taşır.
 */
const scope = globalThis as unknown as {
  document?: unknown;
  window?: unknown;
};
const classes = new Set<string>();

function installBrowser({ desktop }: { desktop: boolean }) {
  classes.clear();
  scope.window = {
    // `finishDesktopStartup` sönme süresi kadar bekliyor; sahte pencerede de zamanlayıcı gerek.
    setTimeout: (callback: () => void, ms?: number) => setTimeout(callback, ms),
    sessionStorage: createFakeStorage(),
    ...(desktop ? { __WHISPR_DESKTOP__: { shell: "desktop" } } : {}),
  } as unknown;
  scope.document = {
    documentElement: {
      classList: {
        add: (name: string) => {
          classes.add(name);
        },
        remove: (name: string) => {
          classes.delete(name);
        },
      },
    },
  } as unknown;
}

async function loadModule() {
  // Modül `window`ı çağrı anında okur; her testte taze bir kopya alınır ki
  // sessionStorage bir sonraki teste sızmasın.
  return import(`./startup-window?case=${classes.size}-${Math.random()}`);
}

beforeEach(() => {
  installBrowser({ desktop: true });
});

afterEach(() => {
  delete scope.window;
  delete scope.document;
});

describe("desktop startup window handoff", () => {
  it("masaüstünde küçük pencere işaretini ve ölçek sınıfını koyar", async () => {
    const startup = await loadModule();

    assert.equal(startup.isDesktopStartupWindowPending(), false);

    startup.markDesktopStartupWindowPending();

    assert.equal(startup.isDesktopStartupWindowPending(), true);
    assert.ok(classes.has("whispr-splash-desktop-scale"));
  });

  it("tarayıcıda hiçbir şey işaretlemez", async () => {
    installBrowser({ desktop: false });

    const startup = await loadModule();
    startup.markDesktopStartupWindowPending();

    assert.equal(startup.isDesktopStartupWindowPending(), false);
    assert.equal(classes.size, 0);
  });

  it("devredilen adım yalnız ileri yazılır", async () => {
    const startup = await loadModule();

    startup.writeDesktopStartupStep("session");
    assert.equal(startup.readDesktopStartupStep(), "session");

    startup.writeDesktopStartupStep("connecting");
    assert.equal(startup.readDesktopStartupStep(), "session");

    startup.writeDesktopStartupStep("servers");
    assert.equal(startup.readDesktopStartupStep(), "servers");
  });

  it("bozuk devir değerini yok sayar", async () => {
    const startup = await loadModule();

    (
      scope.window as { sessionStorage: ReturnType<typeof createFakeStorage> }
    ).sessionStorage.setItem("whispr.desktop.startupStep", "banana");

    assert.equal(startup.readDesktopStartupStep(), null);
  });

  it("açılış bitince işareti ve ölçeği temizler", async () => {
    const startup = await loadModule();

    startup.markDesktopStartupWindowPending();
    startup.writeDesktopStartupStep("servers");

    // Tauri köprüsü test ortamında yok; terfi başarısız olsa bile devir kaydı
    // temizlenmeli, aksi hâlde perde hiç kalkmazdı.
    await startup.finishDesktopStartup();

    assert.equal(startup.isDesktopStartupWindowPending(), false);
    assert.equal(startup.readDesktopStartupStep(), null);
    assert.equal(classes.has("whispr-splash-desktop-scale"), false);
  });

  it("kabuk hedeflerini tanır, başkalarını tanımaz", async () => {
    const startup = await loadModule();

    for (const destination of ["/home", "/messages", "/servers/123/channels/9", "/home?tab=1"]) {
      assert.equal(startup.isShellOwnedDesktopDestination(destination), true, destination);
    }

    for (const destination of ["/login?callbackUrl=%2Fhome", "/invite/abc", "/", "/homework"]) {
      assert.equal(startup.isShellOwnedDesktopDestination(destination), false, destination);
    }
  });

  it("perdeyi kapatan geri çağrıyı devir temizlendikten sonra, pencere gösterilmeden önce çalıştırır", async () => {
    const startup = await loadModule();

    startup.markDesktopStartupWindowPending();

    let clearedWhenCalled: boolean | null = null;
    let resolved = false;

    const promise = startup.finishDesktopStartup(() => {
      clearedWhenCalled = !startup.isDesktopStartupWindowPending();
      // Geri çağrı akış hâlâ sürerken gelmeli: perde, pencere gösterilmeden söner.
      assert.equal(resolved, false);
    });

    await promise;
    resolved = true;

    assert.equal(clearedWhenCalled, true);
  });

  it("eşzamanlı bitirme çağrıları tek terfiyi paylaşır", async () => {
    const startup = await loadModule();

    startup.markDesktopStartupWindowPending();

    const [first, second] = await Promise.all([
      startup.finishDesktopStartup(),
      startup.finishDesktopStartup(),
    ]);

    assert.equal(first, second);
    assert.equal(startup.isDesktopStartupWindowPending(), false);
  });
});
