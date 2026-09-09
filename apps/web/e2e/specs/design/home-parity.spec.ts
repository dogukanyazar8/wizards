import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { setE2EUserTheme } from "../../helpers/db";
import {
  applyParityTheme,
  collectUndersizedTapTargets,
  expectNoClippedText,
  expectNoOverflow,
  readRootFontSize,
  type ParityTheme,
} from "../../helpers/design-parity";
import { gotoAppRoute } from "../../helpers/navigation";
import type { Page } from "@playwright/test";

/**
 * Ana Sayfa "1a Komuta Merkezi" parity matrisi — SPEC-ANA-SAYFA §8.4, Faz 8 §1.
 *
 * Faz 4'te yalnız taban kombinasyon (1360×920, açık tema) açıktı; Faz 8 kalan 11'ini açar.
 * Tema ekseninin **çalışması** için Faz 4 §6.1'de bulunan tuzak burada kapatıldı:
 * `applyParityTheme` yalnız `localStorage` yazıyordu, oturum açık kullanıcıda `ThemeSessionSync`
 * hesabın kayıtlı temasını uygulayıp bunu eziyordu. Artık kaynağı da (`User.theme`) ayarlıyoruz
 * ve uygulanan temayı ekranda **doğruluyoruz** — eksen bir daha sessizce yalan söyleyemez.
 */

/**
 * SPEC §8.1 adım tablosu. `expectedRootFontSize` aynı tablodan gelir — ×1.15 adımının kök font
 * boyutu 18px'tir (16 × 1.125), etiketteki 1.15 çarpanı değil.
 */
const VIEWPORTS = [
  { expectedRootFontSize: 16, expectedScale: 1, height: 920, name: "base", width: 1360 },
  { expectedRootFontSize: 16, expectedScale: 1, height: 900, name: "hd", width: 1600 },
  { expectedRootFontSize: 18, expectedScale: 1.15, height: 1080, name: "fhd", width: 1920 },
  { expectedRootFontSize: 24, expectedScale: 1.5, height: 1440, name: "qhd", width: 2560 },
  { expectedRootFontSize: 32, expectedScale: 2, height: 2160, name: "uhd", width: 3840 },
  // Ölçek yükseklikten sınırlanır: 1440 / 920 = 1.56 → ×1.5'te kalır, ×2 Arkadaşlar şeridini kırpar.
  { expectedRootFontSize: 24, expectedScale: 1.5, height: 1440, name: "ultra", width: 5120 },
] as const;

const THEMES: readonly ParityTheme[] = ["theme-light", "theme-dark"];

/** Tıklanabilir her yüzey — SPEC §5.3 gereği hepsi gerçek `button` ya da `a`. */
const TAP_TARGET_SELECTOR =
  '[data-testid="home-command-center"] button, [data-testid="home-command-center"] a[href]';

/**
 * Tasarımın kendi ölçüleri 44px'in altında kalan yüzeyler — SPEC §8.2.5 ile referans HTML
 * arasındaki bilinen çelişki (Faz 4 §6.2, Faz 8 kararı bekliyor).
 *
 * Liste **kapalı**: burada olmayan yeni bir küçük hedef testi kırar. Ölçülen boyutlar
 * `test-results/parity-tap/<kombinasyon>.json` dosyalarına yazılır, rapor oradan beslenir.
 */
const DESIGN_TAP_TARGET_EXCEPTIONS = new Set([
  "home-command-search",
  "home-friend-card",
  "home-header-link",
  "home-presence-chip-dnd",
  "home-presence-chip-idle",
  "home-presence-chip-offline",
  "home-presence-chip-online",
  "home-presence-focus-toggle",
  "notification-bell-button",
]);

/** Açılış perdesi saydamlaşıp kaybolmadan alınan ekran görüntüsü perdenin fotoğrafıdır. */
async function waitForHomeReady(page: Page): Promise<void> {
  await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });

  await expect(page.getByTestId("home-bento-grid")).toBeVisible();

  /*
   * Sunucu rayı, sunucu sorgusu inene kadar `ServerRailSkeleton` çiziyor ve iskelette marka
   * logosu **yok**. `expectCanonicalShellSurfaces` logonun animasyonunu ölçtüğü için, hazırlık
   * kapısı iskeleti geçmezse ölçüm "yüzey yok" diye kırılır — testin kendi yarışıydı.
   *
   * `.whispr-logo-bar` beş ayrı çubuktur; `.first()` olmadan strict kip ihlal olur.
   */
  await expect(page.locator('[data-testid="server-rail"] .whispr-logo-bar').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const splash = document.querySelector('[data-testid="app-startup-screen"]');

          return splash === null ? 0 : Number(getComputedStyle(splash).opacity);
        }),
      { timeout: 15_000 },
    )
    .toBe(0);
}

/** Ölçülen tema, istenen tema mı? Faz 4 §6.1 tuzağının kalıcı bekçisi. */
async function expectAppliedTheme(page: Page, theme: ParityTheme): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Array.from(document.documentElement.classList).filter((name) =>
            name.startsWith("theme-"),
          ),
        ),
      { timeout: 10_000 },
    )
    .toEqual([theme]);
}

async function expectCanonicalShellSurfaces(page: Page, theme: ParityTheme): Promise<void> {
  const surfaces = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector(selector);

      if (!(element instanceof HTMLElement)) {
        throw new Error(`Missing shell surface: ${selector}`);
      }

      return getComputedStyle(element);
    };
    const rail = read('[data-testid="server-rail"]');
    const panel = read('[data-testid="app-nav-panel"]');
    const shell = read(".whispr-channel-shell");
    const main = read(".app-main-gradient");
    const logoBar = read('[data-testid="server-rail"] .whispr-logo-bar');

    return {
      logoAnimationName: logoBar.animationName,
      mainBackgroundImage: main.backgroundImage,
      panelBackgroundColor: panel.backgroundColor,
      railBackgroundColor: rail.backgroundColor,
      shellBackgroundImage: shell.backgroundImage,
    };
  });

  const expectedPaneColor = theme === "theme-light" ? "rgb(242, 244, 248)" : "rgb(47, 50, 55)";

  expect(surfaces.railBackgroundColor).toBe(expectedPaneColor);
  expect(surfaces.panelBackgroundColor).toBe(expectedPaneColor);
  expect(surfaces.shellBackgroundImage).toBe("none");
  expect(surfaces.mainBackgroundImage).toContain("linear-gradient");
  expect(surfaces.mainBackgroundImage).not.toContain("radial-gradient");
  expect(surfaces.logoAnimationName).toBe("auth-equalizer");
}

async function runParityChecks(
  page: Page,
  viewport: (typeof VIEWPORTS)[number],
  theme: ParityTheme,
): Promise<void> {
  const combination = `${viewport.name}-${viewport.width}x${viewport.height}-${theme}`;

  await setE2EUserTheme("alice", theme);
  await applyParityTheme(page, theme);
  await page.setViewportSize({ height: viewport.height, width: viewport.width });
  await loginAs(page, "alice");
  await waitForHomeReady(page);

  const screen = page.getByTestId("home-command-center");
  await expect(screen).toBeVisible();

  await expectAppliedTheme(page, theme);
  await expectCanonicalShellSurfaces(page, theme);
  expect(await readRootFontSize(page)).toBeCloseTo(viewport.expectedRootFontSize, 1);
  await expectNoOverflow(page);
  await expectNoClippedText(page);

  const undersized = await collectUndersizedTapTargets(page, TAP_TARGET_SELECTOR);

  // Playwright bir test kırıldığında worker sürecini yeniler; modül seviyesindeki bir dizi
  // o anda sıfırlanır. Ölçüm bu yüzden kombinasyon başına ayrı dosyaya yazılır.
  const { mkdir, writeFile } = await import("node:fs/promises");

  await mkdir("test-results/parity-tap", { recursive: true });
  await writeFile(
    `test-results/parity-tap/${combination}.json`,
    `${JSON.stringify(undersized, null, 2)}
`,
    "utf8",
  );

  const unexpected = undersized
    .map((target) => target.testId ?? target.label)
    .filter((label) => !DESIGN_TAP_TARGET_EXCEPTIONS.has(label))
    .sort();

  expect(unexpected).toEqual([]);

  await page.screenshot({
    fullPage: false,
    path: `test-results/parity/home-${combination}.png`,
  });
}

test.describe("Ana Sayfa parity matrisi", () => {
  test.afterAll(async () => {
    // Matris `User.theme`'i yazıyor; sonraki spec'ler tohumun varsayılanını beklesin.
    await setE2EUserTheme("alice", "theme-dark");
  });

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const title = `${viewport.name} ${viewport.width}×${viewport.height} ×${viewport.expectedScale} · ${theme}`;

      test(title, async ({ page }) => {
        await runParityChecks(page, viewport, theme);
      });
    }
  }
});
