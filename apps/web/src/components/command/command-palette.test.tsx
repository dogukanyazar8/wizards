import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * `06-faz5` §5. The palette's markup and its two structural promises.
 *
 * There is no DOM in this package, so keyboard behaviour is proven twice over
 * where it can be: the navigation arithmetic in `lib/home/command-palette.test.ts`
 * and the real key presses in `e2e/specs/design/home-command-palette.spec.ts`.
 * What is left for a source-level check is the wiring those two cannot see —
 * that there is exactly one global listener, that the overlay is code-split, and
 * that the search term never reaches the URL.
 */

const ROOT = process.cwd();
const PALETTE = readFileSync(join(ROOT, "src/components/command/command-palette.tsx"), "utf8");
const PROVIDER = readFileSync(
  join(ROOT, "src/components/command/command-palette-provider.tsx"),
  "utf8",
);

describe("command palette — açılış katmanı", () => {
  it("kısayolun tek bir global dinleyicisi vardır", () => {
    const listeners = PROVIDER.match(/addEventListener\("keydown"/g) ?? [];

    assert.equal(listeners.length, 1);
    assert.match(PROVIDER, /removeEventListener\("keydown"/);
    // §9 — palet açıkken tekrar basmak kapatır, ikinci palet açılmaz.
    assert.match(PROVIDER, /if \(isOpen\) \{\s*close\(\);/);
  });

  it("kısayol kararını saf fonksiyona bırakır — yazarken tetiklenmeme kuralı orada testli", () => {
    assert.match(PROVIDER, /isCommandPaletteShortcut\(event\)/);
    assert.doesNotMatch(PROVIDER, /event\.key === "k"/);
  });

  it("`dynamic()` ile bölünür: palet açılmadan bundle'a girmez", () => {
    assert.match(
      PROVIDER,
      /dynamic\(\s*\(\) => import\("@\/components\/command\/command-palette"\)/,
    );
    assert.match(PROVIDER, /ssr: false/);
  });

  it("kapanışta odak tetikleyiciye döner", () => {
    // Satır sonu **önemli değil**: prettier atamayı iki satıra bölebilir ve
    // tek satır bekleyen bir desen, biçimlendirme değişince kaynağın kendisi
    // doğruyken kırılırdı.
    assert.match(PROVIDER, /triggerRef\.current =\s*document\.activeElement/);
    assert.match(PROVIDER, /triggerRef\.current\?\.focus\(\)/);
  });

  it("palet yalnız açıkken render edilir — kapalıyken sorgu da çalışmaz", () => {
    assert.match(PROVIDER, /\{isOpen \? \(\s*<CommandPalette/);
  });
});

describe("command palette — yüzey", () => {
  it("mevcut portal deseniyle çizilir, yeni bir portal mekanizması kurmaz", () => {
    assert.match(PALETTE, /createPortal\(/);
    assert.match(PALETTE, /document\.body,/);
  });

  it("liste `listbox`/`option` ve `aria-activedescendant` taşır", () => {
    assert.match(PALETTE, /role="listbox"/);
    assert.match(PALETTE, /role="option"/);
    assert.match(PALETTE, /aria-activedescendant=/);
  });

  it("kategori kontrolleri sekme rolü taklidi yerine basılı filtre düğmeleridir", () => {
    assert.match(PALETTE, /aria-pressed=\{selected\}/);
    assert.doesNotMatch(PALETTE, /role="tab(list)?"/);
  });

  it("açılışta girdiye odaklanır ve `Esc` kapatır", () => {
    assert.match(PALETTE, /inputRef\.current\?\.focus\(\)/);
    assert.match(PALETTE, /event\.key === "Escape"/);
  });

  it("Tab paletin içinde kalır — odak tuzağı", () => {
    assert.match(PALETTE, /event\.key === "Tab"/);
    assert.match(PALETTE, /querySelectorAll<HTMLElement>\(FOCUSABLE_SELECTOR\)/);
    assert.match(PALETTE, /document\.activeElement === first/);
    assert.match(PALETTE, /document\.activeElement === last/);
  });

  it("oklarla seçilen sonuç kaydırma alanında görünür tutulur", () => {
    assert.match(PALETTE, /scrollIntoView\(\{ block: "nearest" \}\)/);
  });

  it("arama sorgusu URL'e yazılmaz (§5.4 gizlilik)", () => {
    assert.doesNotMatch(PALETTE, /router\.(replace|push)\([^)]*query/);
    assert.doesNotMatch(PALETTE, /searchParams/);
    assert.doesNotMatch(PALETTE, /history\.(replace|push)State/);
  });

  it("429 sakin bir satırla karşılanır ve istek tekrarlanmaz", () => {
    assert.match(PALETTE, /status === 429/);
    assert.match(PALETTE, /retry: false/);
  });

  it("ölçüler sözlükten okunur, JSX'te çıplak piksel yoktur", () => {
    assert.match(PALETTE, /HOME_METRICS/);
    assert.doesNotMatch(PALETTE, /\[\d+px\]/);
  });

  it("genişlik referans arama penceresinin 640'ı", async () => {
    const { HOME_METRICS } = await import("@/lib/home/metrics");

    assert.equal(HOME_METRICS.commandPalette.width, 640);
  });
});
