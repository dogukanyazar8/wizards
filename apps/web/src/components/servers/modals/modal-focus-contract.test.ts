import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

/**
 * Ş9 — üç pencerenin `Esc` · focus tuzağı · tetikleyiciye dönüş sözleşmesi (00 §8).
 *
 * Bu üç davranışın **tek** sahibi `components/ui/modal.tsx`. Test iki yönlü:
 *
 * 1. Üç pencere de o kabuktan geçiyor (`ServerModalShell` → `Modal`) ve kendi `keydown`
 *    dinleyicisini ya da kendi `Escape` dalını yazmıyor. İkinci bir tuzak, iki tuzağın
 *    ayrışması demekti.
 * 2. Kabuğun kendisi üç davranışı hâlâ taşıyor. Kaynağı okuyan bir denetim, tarayıcısız bir
 *    test ortamında (`jsdom` yok) davranışın sessizce silinmesini yakalayan tek şey.
 *
 * Gerçek klavye yolu e2e'de (`e2e/specs/a11y`) sürülür; burada sözleşmenin yeri korunur.
 */

const here = dirname(fileURLToPath(import.meta.url));
const componentsRoot = join(here, "..", "..");

const MODAL_FILES = [
  "channel-invite-modal.tsx",
  "channel-notifications-modal.tsx",
  "create-category-modal.tsx",
  "create-channel-modal.tsx",
  "create-event-modal.tsx",
  // Ş10 — sunucu oluştur (940). Aynı kabuktan geçiyor, aynı sözleşmeye tabi.
  "create-server-modal.tsx",
] as const;

function readModal(file: string): string {
  return readFileSync(join(here, file), "utf8");
}

describe("server modal focus contract", () => {
  for (const file of MODAL_FILES) {
    it(`${file} kabuktan geçer, kendi tuzağını yazmaz`, () => {
      const source = readModal(file);

      assert.match(source, /ServerModalShell/u);
      assert.equal(source.includes('addEventListener("keydown"'), false);
      assert.equal(source.includes('"Escape"'), false);
      assert.equal(source.includes("document.activeElement"), false);
    });
  }

  it("kabuk `ui/modal`ı sarar, ikinci bir modal altyapısı kurmaz", () => {
    const shell = readFileSync(join(here, "server-modal-shell.tsx"), "utf8");

    assert.match(shell, /from "@\/components\/ui\/modal"/u);
    assert.equal(shell.includes("createPortal"), false);
  });

  it("`ui/modal` Esc, focus tuzağı ve tetikleyiciye dönüşü hâlâ taşır", () => {
    const modal = readFileSync(join(componentsRoot, "ui", "modal.tsx"), "utf8");

    // Esc en üstteki katmanı kapatır.
    assert.match(modal, /event\.key === "Escape"/u);
    // Tab sarmalı: sondan başa, baştan sona.
    assert.match(modal, /event\.key !== "Tab"/u);
    assert.match(modal, /event\.shiftKey && activeElement === first/u);
    assert.match(modal, /event\.composedPath\(\)\[0\]/u);
    assert.match(modal, /child\.shadowRoot \?\? child/u);
    // Açılışta ilk odaklanabilir öğe (ya da verilen `initialFocusRef`).
    assert.match(modal, /initialFocusRef\?\.current \?\? focusable\?\.\[0\]/u);
    // Kapanışta tetikleyiciye dönüş.
    assert.match(modal, /previousActiveElementRef\.current\?\.focus\(\)/u);
  });

  it("özel başlıklı pencere çocuklarını flex kabuğundan ayırmaz", () => {
    const modal = readFileSync(join(componentsRoot, "ui", "modal.tsx"), "utf8");

    assert.match(modal, /hideHeader \? children : <div className="mt-6">\{children\}<\/div>/u);
  });
});

/**
 * Ş8 — K11'in katman sözleşmesi. `z-index` sayısı üç yerde tekrar edilemez: kabuk ve ayarlar
 * kaplaması ikisi de `useLayerStack`'ten okur. Sabit bir `z-[80]`/`z-[95]` geri sızarsa
 * ayarlardan açılan pencere yine ayarların altında kalırdı — düzeltilen hatanın tam kendisi.
 */
describe("server layer contract (K11)", () => {
  it("pencere kabuğu katman yığınından geçer, kendi z-index'ini yazmaz", () => {
    const shell = readFileSync(join(here, "server-modal-shell.tsx"), "utf8");

    assert.match(shell, /useLayerStack/u);
    assert.match(shell, /kind: "modal"/u);
    assert.equal(/z-\[\d+\]/u.test(shell), false);
  });

  it("sunucu ayarları kaplaması `settings` katmanıdır ve 95'e geri dönmez", () => {
    // Ş11 (K4): tek dosyalık kaplama silindi, kabuk `shell/server-settings/` altına taşındı.
    const overlay = readFileSync(
      join(componentsRoot, "shell", "server-settings", "server-settings-overlay.tsx"),
      "utf8",
    );

    assert.match(overlay, /useLayerStack/u);
    assert.match(overlay, /kind: "settings"/u);
    assert.match(overlay, /zIndex: settingsLayer\.zIndex/u);
    assert.equal(overlay.includes('className="fixed inset-0 z-[95]'), false);
  });
});

it("child dialogs including shortcut help stack above the settings window", () => {
  const modal = readFileSync(join(componentsRoot, "ui/modal.tsx"), "utf8");
  const settings = readFileSync(join(componentsRoot, "settings/settings-window.tsx"), "utf8");
  const help = readFileSync(join(componentsRoot, "shortcuts/shortcut-help-dialog.tsx"), "utf8");
  const modalLayer = Number(/fixed[^"\n]*? z-\[(\d+)\]/.exec(modal)?.[1]);
  const settingsLayer = Number(/fixed[^"\n]*? z-\[(\d+)\]/.exec(settings)?.[1]);
  assert.ok(modalLayer > settingsLayer);
  assert.match(help, /<Modal/);
  assert.doesNotMatch(help, /font-mono/);
  assert.match(settings, /closest\('\[role="dialog"\]'\)/);
});
