import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { evaluatePasswordStrength } from "@wizards/types";

import { AUTH_METRICS } from "@/lib/auth/metrics";
import { buildAuthCssVars } from "@/lib/auth/css-vars";
import { AUTH_STATUS_CATALOG, AUTH_STATUS_IDS } from "@/lib/auth/status-catalog";

/**
 * SPEC-GIRIS-KAYIT §12 — 13 kabul kriterinin otomatik kapısı.
 *
 * Kapı **kaynak ve CSS okuyarak** ölçer: tarayıcı gerektiren maddeler (görsel karşılaştırma,
 * sekme sırası) e2e'ye bırakılmıştır ve burada değil orada ölçülür. Davranışsal maddeler
 * (10 · 11 · 12) kendi birim testlerinde kanıtlanır; burada onların **sözleşmesi** ölçülür:
 * sabitler doğru mu, çağrı zinciri yerinde mi. Böylece biri sabiti değiştirdiğinde kriter
 * sessizce kaybolmaz.
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

      if (!entry.isFile() || entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
        return [];
      }

      return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [entryPath] : [];
    });
}

const AUTH_SOURCES = [...collectSources(AUTH_COMPONENT_DIR), ...collectSources(AUTH_ROUTE_DIR)];

function read(sourcePath: string) {
  return readFileSync(sourcePath, "utf8");
}

function label(sourcePath: string) {
  return path.relative(WEB_ROOT, sourcePath).replaceAll("\\", "/");
}

/** Yorum satırları sözleşmenin parçası değil; ölçüler yalnız kodda aranır. */
function stripComments(source: string) {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/(^|\s)\/\/[^\n]*/g, "$1");
}

function readCssBlock(selector: string) {
  const start = GLOBALS_CSS.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} globals.css içinde yok.`);
  const end = GLOBALS_CSS.indexOf("}", start);

  return GLOBALS_CSS.slice(start, end);
}

// --- renk yardımcıları: SPEC §12/6 kontrast ölçümü --------------------------

function parseHslTriple(value: string): [number, number, number] {
  const [hue, saturation, lightness] = value
    .trim()
    .split(/\s+/)
    .map((part) => Number.parseFloat(part));

  assert.ok(
    Number.isFinite(hue) && Number.isFinite(saturation) && Number.isFinite(lightness),
    `HSL üçlüsü okunamadı: ${value}`,
  );

  return [hue!, saturation!, lightness!];
}

function hslToRgb(triple: [number, number, number]): [number, number, number] {
  const [hue, saturationPercent, lightnessPercent] = triple;
  const saturation = saturationPercent / 100;
  const lightness = lightnessPercent / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = (((hue % 360) + 360) % 360) / 60;
  const secondary = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const [red, green, blue] =
    huePrime < 1
      ? [chroma, secondary, 0]
      : huePrime < 2
        ? [secondary, chroma, 0]
        : huePrime < 3
          ? [0, chroma, secondary]
          : huePrime < 4
            ? [0, secondary, chroma]
            : huePrime < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const match = lightness - chroma / 2;

  return [red! + match, green! + match, blue! + match];
}

function composite(
  foreground: [number, number, number],
  background: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
  ];
}

function relativeLuminance([red, green, blue]: [number, number, number]) {
  const channel = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (left, right) => right - left,
  );

  return (lighter! + 0.05) / (darker! + 0.05);
}

function readTokenTable(selector: string) {
  const block = readCssBlock(selector);
  const tokens = new Map<string, [number, number, number]>();

  for (const [, name, value] of block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)) {
    if (/^[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(value!.trim())) {
      tokens.set(name!, parseHslTriple(value!));
    }
  }

  return tokens;
}

const LIGHT_TOKENS = readTokenTable("[data-auth-surface]");
const DARK_TOKENS = readTokenTable('[data-auth-theme="dark"] [data-auth-surface]');

describe("auth parity gate — SPEC §12", () => {
  it("1 · draws the aurora as the root's first child and leaves the columns transparent", () => {
    const shell = read(path.join(AUTH_COMPONENT_DIR, "auth-screen.tsx"));
    const auroraIndex = shell.indexOf("<AuthAurora");
    const brandIndex = shell.indexOf("<AuthBrandPanel");
    const columnIndex = shell.indexOf('className="auth-form-column"');

    assert.ok(auroraIndex > 0 && auroraIndex < brandIndex && brandIndex < columnIndex);
    assert.equal(/background/.test(readCssBlock(".auth-brand")), false);
    assert.equal(/background/.test(readCssBlock(".auth-form-column")), false);
  });

  it("2 · keeps the five logo bars on the exact SPEC heights and animates only scale", () => {
    assert.deepEqual(AUTH_METRICS.logo.barHeights, [17, 25, 34, 24, 18]);
    assert.equal(AUTH_METRICS.logo.barWidth, 3);

    /*
     * `BrandLogo` ürün genelinde kullanıldığı için kendi sabitini taşıyor; auth ölçü sözlüğüne
     * bağlanamaz. İki liste ayrışırsa marka paneli SPEC dışına düşer, bu yüzden eşitlik burada
     * kilitlenir.
     */
    const brandLogo = read(path.join(WEB_ROOT, "src", "components", "brand", "brand-logo.tsx"));
    const declaredHeights = brandLogo.match(/LOGO_BAR_HEIGHTS\s*=\s*\[([^\]]+)\]/);
    assert.ok(declaredHeights, "BrandLogo çubuk yükseklikleri okunamadı.");
    assert.deepEqual(
      declaredHeights[1]!.split(",").map((part) => Number.parseInt(part.trim(), 10)),
      [...AUTH_METRICS.logo.barHeights],
    );

    const keyframeStart = GLOBALS_CSS.indexOf("@keyframes auth-equalizer");
    assert.notEqual(keyframeStart, -1, "auth-equalizer kareleri yok.");
    const logoBlock = GLOBALS_CSS.slice(
      keyframeStart,
      GLOBALS_CSS.indexOf("@keyframes", keyframeStart + 10),
    );

    assert.match(logoBlock, /scaleY\(/);
    // Yükseklik animasyonu düzeni her karede yeniden kurar; SPEC yalnız `scale()` istiyor.
    assert.doesNotMatch(logoBlock, /\bheight\s*:/);
    assert.match(GLOBALS_CSS, /\.whispr-logo-bar\s*\{[^}]*width:\s*3px/);
  });

  it("3 · keeps Google live, Microsoft and Apple disabled behind a Soon badge, Discord gone", () => {
    // Yorum satırı "Discord kaldırıldı" diyebilir; ölçüm yalnız koda bakar.
    const social = stripComments(read(path.join(AUTH_COMPONENT_DIR, "social-login.tsx")));

    assert.match(social, /google/i);
    assert.match(social, /microsoft/i);
    assert.match(social, /apple/i);
    assert.doesNotMatch(social, /discord/i);
    assert.match(social, /disabled/);
    assert.match(social, /aria-disabled/);
    assert.match(social, /auth\.provider\.soon/);
  });

  it("4 · maps every password score to the SPEC tone without a second opinion", () => {
    const cases: Array<{ sample: string; score: number; tone: string }> = [
      { sample: "", score: 0, tone: "danger" },
      { sample: "a", score: 0, tone: "danger" },
      { sample: "abcdefghij", score: 1, tone: "danger" },
      { sample: "Abcdefghij", score: 2, tone: "warning" },
      { sample: "abcdefghij12", score: 2, tone: "warning" },
      { sample: "Whispr!2026x", score: 4, tone: "success" },
    ];

    for (const { sample, score, tone } of cases) {
      const strength = evaluatePasswordStrength(sample);
      assert.equal(strength.score, score, `"${sample}" skoru beklenenden farklı.`);
      assert.equal(strength.tone, tone, `"${sample}" tonu beklenenden farklı.`);
    }

    const strengthComponent = read(path.join(AUTH_COMPONENT_DIR, "auth-password-strength.tsx"));
    // Bileşen skoru hesaplamaz; hesaplasaydı istemci ile sunucu ayrışabilirdi.
    assert.doesNotMatch(strengthComponent, /length\s*>=|test\(/);
  });

  it("5 · carries no hardcoded Turkish or English copy in the auth trees", () => {
    /*
     * Metin sözlükten gelir (SPEC §12/9). Ürün metni bir JSX metin düğümünde ya da bir
     * `label=`/`placeholder=` dizesinde göründüğü an tema/dil anahtarı onu değiştiremez.
     */
    // `=>` bir metin düğümü değil; ok işlevleri taramaya girmemeli.
    const jsxTextNode = /(?<![=!<>-])>\s*[A-Za-zÇĞİÖŞÜçğıöşü][^<>{}]{3,}</g;
    const copyAttribute = /\b(?:aria-label|label|placeholder|title)\s*=\s*"([^"]{4,})"/g;
    /* Marka adı çevrilmez; sözlüğe konsa yanlışlıkla yerelleştirilebilirdi. */
    const BRAND_LITERALS = new Set(["Whispr"]);

    for (const sourcePath of AUTH_SOURCES) {
      const source = stripComments(read(sourcePath));

      for (const match of source.match(jsxTextNode) ?? []) {
        const text = match.slice(1, -1).trim();

        if (BRAND_LITERALS.has(text)) {
          continue;
        }

        assert.fail(`${label(sourcePath)} sabit metin taşıyor: ${text}`);
      }

      for (const [, value] of source.matchAll(copyAttribute)) {
        if (BRAND_LITERALS.has(value!.trim())) {
          continue;
        }

        assert.fail(`${label(sourcePath)} sabit metin özniteliği taşıyor: ${value}`);
      }
    }
  });

  it("6 · keeps every -soft status text at 4.5:1 over its own tinted background", () => {
    /* SPEC §7 — kart zemini tonun %6–7 tint'i; ölçüm bileşik zemine karşı yapılır. */
    const TINT_ALPHA = 0.07;

    for (const [themeName, tokens] of [
      ["light", LIGHT_TOKENS],
      ["dark", DARK_TOKENS],
    ] as const) {
      const card = tokens.get("--surface-card");
      assert.ok(card, `${themeName}: --surface-card okunamadı.`);

      for (const tone of ["danger", "warning", "success"]) {
        const soft = tokens.get(`--${tone}-soft`);
        const saturated = tokens.get(`--${tone}`);
        assert.ok(soft && saturated, `${themeName}: --${tone}-soft okunamadı.`);

        const background = composite(hslToRgb(saturated), hslToRgb(card), TINT_ALPHA);
        const ratio = contrastRatio(hslToRgb(soft), background);

        assert.ok(
          ratio >= 4.5,
          `${themeName} --${tone}-soft kontrastı ${ratio.toFixed(2)}:1 — 4.5:1 altında.`,
        );
      }

      const secondary = tokens.get("--text-secondary");
      const soft = tokens.get("--surface-soft");
      assert.ok(secondary && soft);
      const neutralRatio = contrastRatio(hslToRgb(secondary), hslToRgb(soft));
      assert.ok(
        neutralRatio >= 4.5,
        `${themeName} nötr durum kontrastı ${neutralRatio.toFixed(2)}:1 — 4.5:1 altında.`,
      );
    }
  });

  it("7 · keeps the mobile tap-target contract owned by the mobile package", () => {
    /*
     * Ölçüm mobil pakette (`mobile-auth-token-contract.test.ts`): web'den mobil kaynağını
     * yeniden ölçmek iki doğruluk kaynağı yaratır. Burada yalnız kapının yerinde durduğu
     * doğrulanır — dosya silinirse kriter sessizce kaybolmasın.
     */
    const mobileGate = path.join(
      WEB_ROOT,
      "..",
      "mobile",
      "scripts",
      "mobile-auth-token-contract.test.ts",
    );
    const source = readFileSync(mobileGate, "utf8");

    assert.match(source, /minTapTarget,\s*44/);
    assert.match(source, /mobileAuthMetrics\.minTapTarget/);
  });

  it("8 · draws the footer everywhere except account creation (K13)", () => {
    /*
     * Alt bilgi kabuğun içinde çizilir, ekranların içinde değil — tek koşul kabukta durur:
     * `variant === "register"` ise çizilmez. Ekranlar yalnız varyantı seçer.
     */
    const shell = read(path.join(AUTH_COMPONENT_DIR, "auth-screen.tsx"));
    assert.match(shell, /variant === "register" \? null : <FooterSecurity \/>/);

    /*
     * Referansta alt bilgi form sütununun **son çocuğu**; `left/right:72px` o sütuna göre
     * ölçülüyor. Pencereye bağlanınca satır iki kolonun ortasına, marka panelinin altına
     * kayıyordu.
     */
    const columnStart = shell.indexOf('className="auth-form-column"');
    const columnEnd = shell.indexOf("<ThemeLanguageControls />");
    assert.ok(columnStart > 0 && columnEnd > columnStart);
    assert.ok(
      shell.indexOf("<FooterSecurity />") > columnStart &&
        shell.indexOf("<FooterSecurity />") < columnEnd,
      "Alt bilgi form sütununun dışında.",
    );

    const registerClient = read(path.join(AUTH_ROUTE_DIR, "register", "register-client.tsx"));
    assert.match(
      registerClient,
      /variant="register"/,
      "Kayıt ekranı register varyantını seçmiyor.",
    );

    for (const [route, file] of [
      ["login", "login-client.tsx"],
      ["forgot-password", "forgot-password-client.tsx"],
      ["reset-password", "reset-password-client.tsx"],
    ] as const) {
      assert.doesNotMatch(
        read(path.join(AUTH_ROUTE_DIR, route, file)),
        /variant="register"/,
        `${route} yanlış varyantı seçiyor; alt bilgisi kaybolur.`,
      );
    }
  });

  it("9 · keeps every status in the catalog bound to dictionary keys only", () => {
    assert.equal(AUTH_STATUS_IDS.length, 10);

    for (const statusId of AUTH_STATUS_IDS) {
      const status = AUTH_STATUS_CATALOG[statusId];

      for (const key of [status.labelKey, status.titleKey, status.descriptionKey]) {
        assert.match(key, /^auth\./, `${statusId} sözlük dışı metin taşıyor: ${key}`);
      }
    }

    // SPEC §13 metin denetimi kendi testinde; kapının yerinde olduğu burada doğrulanır.
    const copyGate = path.join(WEB_ROOT, "src", "lib", "locale", "auth-screen-copy.test.ts");
    assert.match(readFileSync(copyGate, "utf8"), /SKIPPED_BY_K1/);
  });

  it("10 · keeps the two-factor challenge single-use, fingerprinted and five minutes long", () => {
    const challenge = read(path.join(WEB_ROOT, "src", "lib", "auth", "login-challenge.ts"));

    assert.match(challenge, /CHALLENGE_TTL_MS\s*=\s*5\s*\*\s*60_000/);
    // Tek kullanımlık olma Lua betiğiyle sağlanır: okuma ve silme aynı atomik adımda.
    assert.match(challenge, /redis\.call\(\s*["']DEL["']/);
    assert.match(challenge, /createRequestFingerprint/);

    const authorize = read(path.join(WEB_ROOT, "src", "auth.ts"));
    assert.match(authorize, /twoFactorTicket/);
  });

  it("11 · locks the account after five failed attempts for fifteen minutes", () => {
    const lockout = read(path.join(WEB_ROOT, "src", "lib", "auth", "login-lockout.ts"));

    assert.match(lockout, /MAX_ATTEMPTS\s*=\s*5/);
    assert.match(lockout, /LOCK_DURATION_MS\s*=\s*15\s*\*\s*60_000/);
    assert.equal(AUTH_STATUS_CATALOG.accountLocked.level, 3);
    assert.ok(AUTH_STATUS_CATALOG.credentials.meterKey);
  });

  it("12 · revokes every other session when the password changes", () => {
    const passwordReset = read(path.join(WEB_ROOT, "src", "lib", "auth", "password-reset.ts"));

    assert.match(passwordReset, /import \{ revokeUserSessions \}/);
    assert.match(passwordReset, /await revokeUserSessions\(/);

    // Ekrandaki sayı gerçek olmalı: kapatılan cihaz sayısı sunucudan gelir, sabit değil.
    const doneClient = read(path.join(AUTH_ROUTE_DIR, "reset-password", "done", "done-client.tsx"));
    assert.match(doneClient, /signedOutDeviceCount/);
  });

  it("13 · stops every auth animation under reduced motion without moving the layout", () => {
    const blockStart = GLOBALS_CSS.indexOf(
      "prefers-reduced-motion: reduce",
      GLOBALS_CSS.indexOf(".auth-window"),
    );
    assert.notEqual(blockStart, -1, "Auth yüzeyinin reduced-motion bloğu yok.");
    const reducedMotionBlock = GLOBALS_CSS.slice(
      blockStart,
      GLOBALS_CSS.indexOf("}\n}", blockStart) + 3,
    );

    /*
     * Blok tek tek seçici saymıyor; yüzeyin **tamamını** kapsıyor. Böylece sonradan eklenen bir
     * animasyon listeye yazılmayı unutulduğu için hareketli kalamaz.
     */
    assert.match(reducedMotionBlock, /\[data-auth-surface\] \*/);
    assert.match(reducedMotionBlock, /animation:\s*none/);

    // Düzen ve renk değişmemeli: blok yalnız animasyonu kapatır.
    assert.doesNotMatch(reducedMotionBlock, /(?:^|\s)(?:display|width|height|color)\s*:/);
  });

  it("keeps the form reachable when the window is narrower than the two-column layout", () => {
    /*
     * Marka paneli (512) + form (384) + kolon dolgusu (2×72) = 1040. Pencere bundan darsa
     * `.auth-window` kuralının `overflow: hidden`'ı formu ekran dışında kırpıyordu; kaydırma
     * çubuğu da olmadığı için giriş yapılamıyordu. Canlı doğrulamada bulundu.
     */
    const collapse = GLOBALS_CSS.slice(
      GLOBALS_CSS.indexOf("@media (max-width: 1080px)"),
      GLOBALS_CSS.indexOf("@media (max-width: 560px)"),
    );

    assert.ok(collapse.length > 0, "Dar pencere kuralı yok.");
    assert.match(collapse, /\[data-auth-surface\] \.auth-brand \{\s*display:\s*none;/);
  });

  it("centres the reference frame while allowing long forms to grow and scroll", () => {
    /*
     * Referans kabuğu 1280×720 sabit bir kart ve sayfada ortalı. Görüntü alanını kaplarsa
     * marka paneli 512'de kalıp form sütunu büyüyor ve aradaki boşluk açılıyordu.
     */
    assert.equal(AUTH_METRICS.window.web.width, 1280);
    assert.equal(AUTH_METRICS.window.web.height, 720);

    const web = buildAuthCssVars("web") as Record<string, string>;
    assert.equal(web["--auth-window-width"], "80rem");
    assert.equal(web["--auth-window-height"], "45rem");

    const windowBlock = readCssBlock(".auth-window");
    assert.match(windowBlock, /width:\s*var\(--auth-window-width\)/);
    assert.match(windowBlock, /min-height:\s*var\(--auth-window-height\)/);
    assert.match(windowBlock, /height:\s*auto/);
    assert.match(windowBlock, /margin-block:\s*auto/);

    const pageBlock = readCssBlock(".auth-page");
    assert.match(pageBlock, /align-items:\s*flex-start/);
    assert.match(pageBlock, /overflow-y:\s*auto/);
    assert.match(pageBlock, /height:\s*100dvh/);
    assert.match(pageBlock, /justify-content:\s*center/);

    // Kabuk sayfa sarmalayıcısını çiziyor ve aurora pencerenin ilk çocuğu kalıyor.
    const shell = read(path.join(AUTH_COMPONENT_DIR, "auth-screen.tsx"));
    assert.match(shell, /className="auth-page"/);
    assert.ok(shell.indexOf('className="auth-window"') < shell.indexOf("<AuthAurora"));
  });

  it("keeps the reveal button inside the password field and clears room for it", () => {
    const primitives = read(path.join(AUTH_COMPONENT_DIR, "auth-primitives.tsx"));

    // Düğme alanın sarmalayıcısına `trailing` ile girer; dışarıda kalırsa alanın altına düşer.
    assert.match(primitives, /\{trailing\}/);
    assert.match(primitives, /trailing=\{/);
    assert.doesNotMatch(primitives, /className="auth-reveal absolute"/);

    const reveal = readCssBlock(".auth-reveal");
    assert.match(reveal, /top:\s*50%/);
    assert.match(reveal, /transform:\s*translateY\(-50%\)/);
    assert.match(
      GLOBALS_CSS,
      /\.auth-input\[data-reveal="true"\]\s*\{[^}]*padding-right:\s*var\(--auth-reveal-padding\)/,
    );
    assert.equal(AUTH_METRICS.field.revealPaddingRight, 66);
  });

  it("gives the primary button every SPEC §9 state, loading included", () => {
    const primary = readCssBlock(".auth-btn-primary");
    assert.match(primary, /background-color:\s*hsl\(var\(--primary\)\)/);
    assert.match(primary, /box-shadow:\s*var\(--auth-primary-shadow\)/);

    for (const [selector, needle] of [
      [".auth-btn-primary:hover:not(:disabled)", /filter:\s*brightness/],
      [".auth-btn-primary:focus-visible", /box-shadow:/],
      [".auth-btn-primary:active:not(:disabled)", /transform:\s*translateY/],
      [".auth-btn-primary:disabled", /background-color:\s*hsl\(var\(--surface-soft\)\)/],
    ] as const) {
      assert.match(readCssBlock(selector), needle, `${selector} SPEC §9 durumunu taşımıyor.`);
    }

    /*
     * Yükleme durumu düğme aynı anda `disabled` olduğu için metin rengini ve gölgeyi
     * `:disabled` kuralından alıyor ve sönük görünüyordu; görünümün tamamına sahip olmalı.
     */
    const loading = GLOBALS_CSS.slice(
      GLOBALS_CSS.indexOf('.auth-btn-primary[data-loading="true"],'),
      GLOBALS_CSS.indexOf(".auth-spinner {"),
    );
    assert.match(loading, /\.auth-btn-primary\[data-loading="true"\]:disabled/);
    assert.match(
      loading,
      /background-color:\s*hsl\(var\(--primary\) \/ var\(--auth-primary-loading-alpha\)\)/,
    );
    assert.match(loading, /color:\s*hsl\(var\(--primary-foreground\)\)/);
    assert.match(loading, /box-shadow:\s*var\(--auth-primary-shadow\)/);

    // Referans `brightness(1.06)` yazıyor; SPEC §4 ortak tablosu da aynı değeri veriyor.
    assert.equal(AUTH_METRICS.button.primary.hoverBrightness, 1.06);
    assert.equal(AUTH_METRICS.button.primary.pressBrightness, 0.92);
  });

  it("carries no bare pixel measure or hex colour across both auth trees", () => {
    const bareMeasure = /:\s*-?\d+(?:\.\d+)?px\b/;
    const hexColour = /#[0-9a-fA-F]{3,8}\b/;
    const rgbColour = /\brgba?\(/;

    for (const sourcePath of AUTH_SOURCES) {
      const source = stripComments(read(sourcePath));
      /*
       * Sağlayıcı markaları kendi resmî renklerini taşır (Google dört renk, Microsoft dört kare).
       * Bunları Whispr tokenıyla yeniden boyamak marka kurallarını çiğner; SPEC de çok renkli
       * markayı istiyor. İstisna yalnız SVG boya özniteliklerine açıktır.
       */
      const scannable = source.replaceAll(/\b(?:fill|stopColor|stroke)="#[0-9a-fA-F]{3,8}"/g, "");

      assert.equal(bareMeasure.test(scannable), false, `${label(sourcePath)} çıplak px taşıyor.`);
      assert.equal(hexColour.test(scannable), false, `${label(sourcePath)} hex renk taşıyor.`);
      assert.equal(rgbColour.test(scannable), false, `${label(sourcePath)} rgb() rengi taşıyor.`);
    }
  });

  it("bridges every metric branch through CSS variables instead of inline numbers", () => {
    const web = buildAuthCssVars("web");
    const desktop = buildAuthCssVars("desktop");

    for (const [name, value] of Object.entries({ ...web, ...desktop })) {
      assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(String(value)), false, `${name} hex renk taşıyor.`);
      assert.equal(/\bpx\b/.test(String(value)), false, `${name} px birimi taşıyor.`);
    }

    assert.notDeepEqual(web, desktop, "Masaüstü kademesi web ile aynı — SPEC §5 kaybolmuş.");
  });
});
