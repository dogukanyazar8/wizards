import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * SPEC-GIRIS-KAYIT §11 — erişilebilirlik kapısı.
 *
 * Dokuz maddenin **kaynak düzeyinde ölçülebilen** kısmı burada; tarayıcı gerektirenler
 * (odak sırası, axe taraması, ekran okuyucu duyurusu) `e2e/specs/a11y/auth-a11y.spec.ts`
 * içinde. Kapı ikiye bölündü çünkü e2e yerel ortam olmadan koşmuyor ve o zaman bu maddelerin
 * hiçbiri ölçülmemiş olurdu.
 */

const WEB_ROOT = process.cwd();
const AUTH_COMPONENT_DIR = path.join(WEB_ROOT, "src", "components", "auth");
const AUTH_ROUTE_DIR = path.join(WEB_ROOT, "src", "app", "(auth)");
const GLOBALS_CSS = readFileSync(path.join(WEB_ROOT, "src", "app", "globals.css"), "utf8");

function collectSources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(root, entry.name);

      if (entry.isDirectory()) {
        return collectSources(entryPath);
      }

      if (!entry.isFile() || entry.name.includes(".test.")) {
        return [];
      }

      return entry.name.endsWith(".tsx") ? [entryPath] : [];
    });
}

const AUTH_SOURCES = [...collectSources(AUTH_COMPONENT_DIR), ...collectSources(AUTH_ROUTE_DIR)];

function read(...segments: string[]) {
  return readFileSync(path.join(...segments), "utf8");
}

function label(sourcePath: string) {
  return path.relative(WEB_ROOT, sourcePath).replaceAll("\\", "/");
}

describe("auth accessibility gate — SPEC §11", () => {
  it("1 · announces every above-form banner and blocking panel through role=alert", () => {
    const errorLevels = read(AUTH_COMPONENT_DIR, "auth-error-levels.tsx");
    const bannerBlock = errorLevels.slice(
      errorLevels.indexOf("export function AuthBanner"),
      errorLevels.indexOf("export function AuthBlockingPanel"),
    );
    const panelBlock = errorLevels.slice(errorLevels.indexOf("export function AuthBlockingPanel"));

    assert.match(bannerBlock, /role="alert"/);
    assert.match(panelBlock, /role="alert"/);
  });

  it("2 · binds every field message to its field and marks the field invalid", () => {
    const primitives = read(AUTH_COMPONENT_DIR, "auth-primitives.tsx");

    assert.match(primitives, /aria-describedby=\{describedBy \|\| undefined\}/);
    assert.match(primitives, /aria-invalid=\{error \? true : undefined\}/);
    // Mesajın kimliği alanın kimliğinden türer; iki alan aynı sayfada çakışmaz.
    assert.match(primitives, /const errorId = `\$\{inputId\}-error`/);
    assert.match(primitives, /const hintId = `\$\{inputId\}-hint`/);
    assert.match(primitives, /id=\{errorId\}/);
    assert.match(primitives, /id=\{hintId\}/);
  });

  it("3 · keeps the six code cells behaving as a single one-time-code field", () => {
    const codeInput = read(AUTH_COMPONENT_DIR, "auth-code-input.tsx");

    assert.match(codeInput, /autoComplete="one-time-code"/);
    assert.match(codeInput, /inputMode="numeric"/);
    assert.match(codeInput, /aria-label=\{ariaLabel\}/);
    // Hücreler yalnız görsel; ekran okuyucu tek alanı görür.
    assert.match(codeInput, /aria-hidden="true" className="auth-code-row"/);
    assert.match(codeInput, /onPaste=\{handlePaste\}/);
    assert.match(codeInput, /event\.key === "Backspace"/);
  });

  it("4 · marks unavailable providers disabled in both the DOM and the accessible name", () => {
    const social = read(AUTH_COMPONENT_DIR, "social-login.tsx");

    // Gönderim sırasında hepsi kapanır; kullanılamayan iki sağlayıcı her durumda kapalıdır.
    assert.match(social, /disabled=\{!available \|\| disabled\}/);
    assert.match(social, /aria-disabled=\{available \? undefined : true\}/);
    // `Yakında` rozeti erişilebilir ada girer; yoksa düğme sebepsiz kapalı görünür.
    assert.match(social, /aria-label=\{available \? undefined : `\$\{label\} — \$\{soon\}`\}/);
  });

  it("5 · exposes the theme switch as a radiogroup and the language picker as a menu", () => {
    const controls = read(AUTH_COMPONENT_DIR, "theme-language-controls.tsx");

    assert.match(controls, /role="radiogroup"/);
    assert.match(controls, /role="radio"/);
    assert.match(controls, /aria-haspopup="menu"/);
    assert.match(controls, /aria-expanded=\{menuOpen\}/);
    assert.match(controls, /role="menuitemradio"/);
    assert.match(controls, /aria-checked=/);

    // Esc kapatır ve odak tetikleyiciye döner.
    assert.match(controls, /"Escape"/);
    assert.match(controls, /triggerRef\.current\?\.focus\(\)/);
  });

  it("6 · never removes an outline without giving a focus-visible ring back", () => {
    /*
     * `outline:none` tek başına odağı görünmez yapar. Auth kuralları onu yalnız kendi halkasını
     * çizmek için kullanabilir, o yüzden aynı blokta bir `box-shadow` halkası aranır.
     */
    for (const [, selector, block] of GLOBALS_CSS.matchAll(/(\.auth-[^{};]*?)\s*\{([^{}]*)\}/g)) {
      if (!/outline:\s*none/.test(block!)) {
        continue;
      }

      assert.match(
        selector!,
        /:focus-visible/,
        `${selector!.trim()} odak dışında outline'ı kaldırıyor.`,
      );
      assert.match(block!, /box-shadow:/, `${selector!.trim()} odak halkası çizmiyor.`);
    }

    for (const source of AUTH_SOURCES) {
      const contents = readFileSync(source, "utf8");

      if (!/outline-none/.test(contents)) {
        continue;
      }

      // Halka alanın kendisinde (`focus-visible:`) ya da sarmalayıcısında (`focus-within:`) olabilir.
      assert.match(
        contents,
        /focus-(?:visible|within):/,
        `${label(source)} odak halkasını kaldırıyor.`,
      );
    }
  });

  it("7 · stops motion under reduced-motion without touching layout or colour", () => {
    const start = GLOBALS_CSS.indexOf(
      "prefers-reduced-motion: reduce",
      GLOBALS_CSS.indexOf(".auth-window"),
    );
    assert.notEqual(start, -1);
    const block = GLOBALS_CSS.slice(start, GLOBALS_CSS.indexOf("}\n}", start) + 3);

    assert.match(block, /\[data-auth-surface\] \*/);
    assert.match(block, /animation:\s*none/);
    assert.doesNotMatch(
      block,
      /(?:^|\s)(?:display|position|width|height|margin|padding|color)\s*:/,
    );
  });

  it("8 · gives every auth screen exactly one h1", () => {
    /*
     * Başlık `AuthTitle` içinde bir kez tanımlıdır; ekranlar kendi `<h1>`'ini yazmaz. Engelleyici
     * blok da `<h1>` çizer ama formun yerine geçer, aynı anda ikisi görünmez.
     */
    const primitives = read(AUTH_COMPONENT_DIR, "auth-primitives.tsx");
    assert.match(primitives, /<h1 className="auth-title">/);

    for (const source of AUTH_SOURCES) {
      const contents = readFileSync(source, "utf8");
      const headings = contents.match(/<h1[\s>]/g) ?? [];

      assert.ok(
        headings.length <= 1,
        `${label(source)} birden fazla <h1> çiziyor (${headings.length}).`,
      );
    }
  });

  it("9 · keeps live regions polite where the value updates without a user action", () => {
    // Sayaç ve güç göstergesi kendiliğinden değişir; `alert` olsaydı her saniye sözü keserdi.
    assert.match(read(AUTH_COMPONENT_DIR, "auth-password-strength.tsx"), /aria-live="polite"/);
    // `role="status"` kibar canlı bölge demektir; sayaç pill'i bunu kullanır.
    assert.match(read(AUTH_COMPONENT_DIR, "auth-pieces.tsx"), /role="status"/);
    assert.doesNotMatch(read(AUTH_COMPONENT_DIR, "auth-pieces.tsx"), /aria-live="assertive"/);
  });
});
