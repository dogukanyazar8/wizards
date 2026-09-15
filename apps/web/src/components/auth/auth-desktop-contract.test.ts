import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { AUTH_METRICS } from "@/lib/auth/metrics";
import { buildAuthCssVars } from "@/lib/auth/css-vars";

/**
 * SPEC-GIRIS-KAYIT §5 — masaüstü penceresi ve ölçek kademesi.
 *
 * Masaüstü ayrı bir ekran ailesi değil: aynı ekranlar bir kademe küçülür. Bu testin işi o
 * kademenin **tek anahtardan** sürüldüğünü ve bileşenlerin içine koşul sızmadığını tutmak.
 */

const WEB_ROOT = process.cwd();

function read(...segments: string[]) {
  return readFileSync(path.join(WEB_ROOT, ...segments), "utf8");
}

const GLOBALS = read("src", "app", "globals.css");
const GATE = read("src", "components", "auth", "auth-surface-gate.tsx");
const LAYOUT = read("src", "app", "(auth)", "layout.tsx");

const AUTH_COMPONENTS = [
  "auth-aurora.tsx",
  "auth-brand-panel.tsx",
  "auth-code-input.tsx",
  "auth-error-levels.tsx",
  "auth-password-strength.tsx",
  "auth-pieces.tsx",
  "auth-primitives.tsx",
  "auth-screen.tsx",
  "auth-status-view.tsx",
  "social-login.tsx",
  "theme-language-controls.tsx",
];

describe("auth desktop contract", () => {
  it("marks the surface once, in the auth layout", () => {
    assert.match(LAYOUT, /<AuthSurfaceGate>\{children\}<\/AuthSurfaceGate>/);
    assert.match(GATE, /isWhisprDesktopRuntime/);
    assert.match(GATE, /surface=\{isDesktop \? "desktop" : "web"\}/);
  });

  it("never lets a desktop condition leak into a component", () => {
    for (const name of AUTH_COMPONENTS) {
      const source = read("src", "components", "auth", name);

      assert.equal(
        /isWhisprDesktopRuntime|whispr-desktop-chrome|isDesktop/.test(source),
        false,
        `${name} masaüstü koşulu taşıyor.`,
      );
    }
  });

  it("keeps the SPEC §5 scale table", () => {
    const web = buildAuthCssVars("web") as Record<string, string>;
    const desktop = buildAuthCssVars("desktop") as Record<string, string>;

    const expected: Array<[string, string, string]> = [
      // [değişken, web, masaüstü] — SPEC §5 tablosu.
      ["--auth-brand-width", "32rem", "23.5rem"], // 512 → 376
      ["--auth-brand-ring", "9.375rem", "6.5rem"], // 150 → 104
      ["--auth-brand-wordmark", "2.625rem", "2rem"], // 42 → 32
      ["--auth-brand-tagline", "0.90625rem", "0.8125rem"], // 14.5 → 13
      ["--auth-brand-divider-max", "18.75rem", "14.375rem"], // 300 → 230
      ["--auth-brand-heading", "1.3125rem", "1.125rem"], // 21 → 18
      ["--auth-form-padding", "4.5rem", "3.5rem"], // 72 → 56
      ["--auth-form-max", "24rem", "22rem"], // 384 → 352
      ["--auth-form-register-padding", "3.5rem", "3rem"], // 56 → 48
      ["--auth-form-register-max", "26.5rem", "24.5rem"], // 424 → 392
      ["--auth-title", "1.8125rem", "1.5625rem"], // 29 → 25
      ["--auth-label", "0.78125rem", "0.75rem"], // 12.5 → 12
      ["--auth-field-height", "2.875rem", "2.6875rem"], // 46 → 43
      ["--auth-primary-height", "3rem", "2.875rem"], // 48 → 46
      ["--auth-provider-height", "2.75rem", "2.625rem"], // 44 → 42
      ["--auth-selector-height", "1.875rem", "1.75rem"], // 30 → 28
      ["--auth-segment", "1.625rem", "1.5rem"], // 26 → 24
      ["--auth-footer-left", "4.5rem", "3.5rem"], // 72 → 56
      ["--auth-footer-bottom", "1.875rem", "1.375rem"], // 30 → 22
      ["--auth-selector-top", "1.625rem", "1.125rem"], // 26 → 18
      ["--auth-selector-right", "2rem", "1.375rem"], // 32 → 22
    ];

    for (const [variable, webValue, desktopValue] of expected) {
      assert.equal(web[variable], webValue, `${variable} web değeri`);
      assert.equal(desktop[variable], desktopValue, `${variable} masaüstü değeri`);
    }
  });

  it("shrinks the aurora exactly as SPEC §5 asks", () => {
    const desktop = buildAuthCssVars("desktop") as Record<string, string>;

    assert.equal(desktop["--auth-aurora-inset"], "-32%");
    assert.equal(desktop["--auth-aurora-a"], "32% 36% at 30% 36%");
    assert.equal(desktop["--auth-aurora-b"], "26% 30% at 72% 70%");
    assert.equal(desktop["--auth-aurora-duration"], "16000ms");
  });

  it("keeps the K7 title bar height in one place", () => {
    assert.equal(AUTH_METRICS.window.desktop.titlebarHeight, 38);
    assert.match(GLOBALS, /--desktop-titlebar-height: 38px;/);

    // Ürünün kabuğu değişkeni okuyor; ölçü iki yerde yaşamıyor.
    const chrome = read("src", "components", "desktop", "desktop-window-chrome.tsx");
    assert.match(chrome, /h-\[var\(--desktop-titlebar-height\)\]/);
  });

  it("takes the title bar out of the auth window height", () => {
    assert.match(
      GLOBALS,
      /html\.whispr-desktop-chrome \[data-auth-surface\] \{[^}]*min-height: calc\(100dvh - var\(--desktop-titlebar-height\)\)/s,
    );
  });

  it("keeps the desktop logo scale on the brand panel", () => {
    const desktop = buildAuthCssVars("desktop") as Record<string, string>;

    assert.equal(desktop["--auth-brand-logo-scale"], String(AUTH_METRICS.logo.scale.desktop));
    assert.equal(AUTH_METRICS.logo.scale.desktop, 1.2);
  });

  it("keeps both columns in the centred reference frame when desktop is maximized", () => {
    const desktop = buildAuthCssVars("desktop") as Record<string, string>;
    assert.equal(desktop["--auth-window-width"], "65rem");
    const frame = GLOBALS.match(/^\.auth-window \{([^}]+)\}/m)?.[1] ?? "";
    const nativeFrame =
      GLOBALS.match(/html\.whispr-desktop-chrome \.auth-window \{([^}]+)\}/)?.[1] ?? "";
    assert.match(frame, /width: var\(--auth-window-width\)/);
    assert.match(frame, /max-width: 100%/);
    assert.match(frame, /margin-block: auto/);
    assert.match(
      nativeFrame,
      /min-height: calc\(var\(--auth-window-height\) - var\(--desktop-titlebar-height\)\)/,
    );
    assert.doesNotMatch(nativeFrame, /(?:^|;)\s*width:|100(?:dvh|vh|vw)/);
  });
});
