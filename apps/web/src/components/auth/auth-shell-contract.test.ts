import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { buildAuthCssVars } from "@/lib/auth/css-vars";

/**
 * Ş3 kabuk sözleşmesi.
 *
 * Bu şerit ekran yazmadığı için doğrulama kaynak düzeyinde yapılır: sıra (aurora kökün ilk
 * çocuğu), yasak desenler (çıplak `px`, hex renk), ve `AUTH_METRICS` → CSS değişkeni köprüsü.
 * Ekran davranışı Dalga 2'nin testlerinde ölçülecek.
 */

const COMPONENT_DIR = path.join(process.cwd(), "src", "components", "auth");
const GLOBALS_CSS = path.join(process.cwd(), "src", "app", "globals.css");

const AUTH_COMPONENTS = [
  "auth-aurora.tsx",
  "auth-brand-panel.tsx",
  "auth-code-input.tsx",
  "auth-error-levels.tsx",
  "auth-password-strength.tsx",
  "auth-pieces.tsx",
  "auth-primitives.tsx",
  "auth-screen.tsx",
  "social-login.tsx",
  "theme-language-controls.tsx",
];

function readComponent(name: string) {
  return readFileSync(path.join(COMPONENT_DIR, name), "utf8");
}

/**
 * Yorumlar sözleşmenin parçası değil: bir kuralın **neden** 72px olduğunu anlatan açıklama
 * ölçü sayılmamalı. `parity.test.ts` da aynı ayrımı yapıyor.
 */
function stripComments(source: string) {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/(^|\s)\/\/.*/g, "$1");
}

describe("auth shell contract", () => {
  it("puts the aurora before the columns (kabul kriteri 1)", () => {
    const source = readComponent("auth-screen.tsx");
    const auroraIndex = source.indexOf("<AuthAurora");
    const brandIndex = source.indexOf("<AuthBrandPanel");
    const columnIndex = source.indexOf('className="auth-form-column"');

    assert.ok(auroraIndex > 0, "Aurora kabukta yok.");
    assert.ok(auroraIndex < brandIndex, "Aurora marka panelinden sonra çiziliyor.");
    assert.ok(brandIndex < columnIndex, "Marka paneli form sütunundan sonra geliyor.");
  });

  it("never paints an opaque background on the columns", () => {
    const css = readFileSync(GLOBALS_CSS, "utf8");
    const brandBlock = css.slice(css.indexOf(".auth-brand {"), css.indexOf(".auth-brand-mark {"));
    const columnBlock = css.slice(
      css.indexOf(".auth-form-column {"),
      css.indexOf(".auth-form-column[data-variant"),
    );

    assert.equal(/background/.test(brandBlock), false, "Marka paneli zemin boyuyor.");
    assert.equal(/background/.test(columnBlock), false, "Form sütunu zemin boyuyor.");
  });

  it("renders the brand logo without turning it into a link (SPEC §2)", () => {
    const source = readComponent("auth-brand-panel.tsx");

    assert.match(source, /<BrandLogo animated interactive=\{false\} \/>/);
  });

  it("hides the component wordmark so the panel draws its own", () => {
    const css = readFileSync(GLOBALS_CSS, "utf8");
    const block = css.slice(css.indexOf(".auth-brand-mark .whispr-logo-wordmark"));

    assert.match(block.slice(0, 120), /display:\s*none/);
  });

  it("keeps Google active and the other two behind a Soon badge (K14)", () => {
    const source = readComponent("social-login.tsx");

    assert.match(source, /available: true, icon: GoogleIcon/);
    assert.match(source, /available: false, icon: MicrosoftIcon/);
    assert.match(source, /available: false, icon: AppleIcon/);
    // Yorumlarda geçmesi serbest — aranan şey kodda bir Discord dalı kalmaması.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.equal(/Discord/i.test(code), false, "Discord düğmesi hâlâ duruyor.");
    assert.match(source, /aria-disabled=/);
    assert.match(source, /aria-label=\{available \? undefined : `\$\{label\} — \$\{soon\}`\}/);
  });

  it("carries no bare pixel or hex colour inside the auth components", () => {
    for (const name of AUTH_COMPONENTS) {
      const source = stripComments(readComponent(name));

      assert.equal(
        /#[0-9a-fA-F]{3,8}\b/.test(source.replace(/<svg[\s\S]*?<\/svg>/g, "")),
        false,
        `${name} hex renk taşıyor.`,
      );
      assert.equal(/\brgba?\(/.test(source), false, `${name} rgb() renk taşıyor.`);
      assert.equal(
        /:\s*-?\d+(\.\d+)?px\b/.test(source),
        false,
        `${name} çıplak px ölçüsü taşıyor.`,
      );
    }
  });

  it("bridges every metric through CSS variables", () => {
    const web = buildAuthCssVars("web") as Record<string, string>;
    const desktop = buildAuthCssVars("desktop") as Record<string, string>;

    // SPEC §5 ölçek kademesi: aynı anahtarlar, farklı değerler.
    assert.deepEqual(Object.keys(web).sort(), Object.keys(desktop).sort());
    assert.notEqual(web["--auth-brand-width"], desktop["--auth-brand-width"]);
    assert.notEqual(web["--auth-title"], desktop["--auth-title"]);
    assert.equal(web["--auth-brand-width"], "32rem"); // 512px
    assert.equal(desktop["--auth-brand-width"], "23.5rem"); // 376px
    assert.equal(web["--auth-primary-height"], "3rem"); // 48px
    assert.equal(desktop["--auth-primary-height"], "2.875rem"); // 46px

    for (const [name, value] of Object.entries(web)) {
      assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(value), false, `${name} hex renk taşıyor.`);
      assert.equal(/\brgba?\(/.test(value), false, `${name} rgb() renk taşıyor.`);
    }
  });

  it("stops every animation under reduced motion without touching layout", () => {
    const css = readFileSync(GLOBALS_CSS, "utf8");
    const start = css.indexOf("@media (prefers-reduced-motion: reduce) {\n  [data-auth-surface] *");
    assert.ok(start > 0, "Auth hareket azaltma kuralı yok.");

    const block = css.slice(
      start,
      css.indexOf("}", css.indexOf("animation: none !important", start)),
    );

    assert.match(block, /animation:\s*none\s*!important/);
    assert.equal(/color|background|transform|display|margin|padding/.test(block), false);
  });

  it("keeps the success banner glyph distinct from the tick (SPEC §4.7)", () => {
    const source = readComponent("auth-error-levels.tsx");

    assert.match(source, /tone === "success" \? "↻" : "!"/);
  });

  it("keeps the countdown pill on a single line", () => {
    const css = readFileSync(GLOBALS_CSS, "utf8");
    const block = css.slice(css.indexOf(".auth-pill {"), css.indexOf(".auth-pill::before"));

    assert.match(block, /white-space:\s*nowrap/);
  });

  it("keeps the auth theme switch away from the global theme preference (K6)", () => {
    const source = readComponent("theme-language-controls.tsx");

    assert.equal(/next-themes/.test(source), false, "Auth anahtarı global temaya yazıyor.");
    assert.match(source, /applyAuthTheme/);
    assert.match(source, /role="radiogroup"/);
    assert.match(source, /aria-haspopup="menu"/);
  });
});
