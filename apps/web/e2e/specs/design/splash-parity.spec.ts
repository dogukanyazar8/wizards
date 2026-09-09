import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { authenticateAs } from "../../helpers/auth";
import { setE2EUserLocale } from "../../helpers/db";
import { applyParityTheme, type ParityTheme } from "../../helpers/design-parity";

/**
 * SPEC-SPLASH §10 parity turu.
 *
 * İddia "açılış ekranı görünüyor" değil; kabul kriterlerinin **ölçülebilir** hâli:
 * aurora kökte mi, işaret halkasıyla eş merkezli mi, rozet ve sürüm satırı her
 * karede var mı, 420px'lik pencerede ipucu kırpılıyor mu, durum tonları iki temada
 * da okunur mu, hareket azaltma altında animasyon kalıyor mu.
 *
 * Açılış ekranı doğası gereği geçicidir; burada ağ yanıtları bilerek geciktirilerek
 * ekran ölçüm süresince ayakta tutulur.
 */

const THEMES: readonly ParityTheme[] = ["theme-dark", "theme-light"];
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING_IMPACTS = new Set(["critical", "serious"]);
const HOLD_MS = 20_000;

/** Kabuk verisini geciktirir; açılış ekranı ölçüm boyunca ayakta kalır. */
async function holdWorkspaceApi(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    await route.continue();
  });
}

/** Masaüstü açılış penceresinin oturum çözümünü geciktirir. */
async function holdDesktopSession(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    await route.continue();
  });
}

async function readContrast(page: Page, foregroundToken: string, backgroundToken: string) {
  return page.evaluate(
    ([foreground, background]) => {
      const styles = getComputedStyle(document.documentElement);
      const parse = (token: string) => {
        const [hue, saturation, lightness] = styles
          .getPropertyValue(token)
          .trim()
          .split(/\s+/)
          .map((part) => Number.parseFloat(part));

        return {
          hue: hue ?? 0,
          lightness: (lightness ?? 0) / 100,
          saturation: (saturation ?? 0) / 100,
        };
      };
      const toRgb = ({
        hue,
        lightness,
        saturation,
      }: {
        hue: number;
        lightness: number;
        saturation: number;
      }) => {
        const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
        const huePrime = (((hue % 360) + 360) % 360) / 60;
        const second = chroma * (1 - Math.abs((huePrime % 2) - 1));
        const [red, green, blue] =
          huePrime < 1
            ? [chroma, second, 0]
            : huePrime < 2
              ? [second, chroma, 0]
              : huePrime < 3
                ? [0, chroma, second]
                : huePrime < 4
                  ? [0, second, chroma]
                  : huePrime < 5
                    ? [second, 0, chroma]
                    : [chroma, 0, second];
        const match = lightness - chroma / 2;

        return [(red ?? 0) + match, (green ?? 0) + match, (blue ?? 0) + match];
      };
      const luminance = (rgb: number[]) => {
        const [red, green, blue] = rgb.map((channel) =>
          channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
        );

        return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
      };

      const first = luminance(toRgb(parse(foreground ?? "")));
      const second = luminance(toRgb(parse(background ?? "")));

      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    },
    [foregroundToken, backgroundToken],
  );
}

test.describe("SPEC-SPLASH — açılış ekranı", () => {
  test.beforeAll(async () => {
    await setE2EUserLocale("alice", "tr");
  });

  test.afterAll(async () => {
    await setE2EUserLocale("alice", "en");
  });

  test("kabuk açılışında aurora kökte, kolonlar opak zemin almıyor", async ({ page }) => {
    await authenticateAs(page, "alice");
    await holdWorkspaceApi(page);
    await page.goto("/home");

    const splash = page.getByTestId("splash-screen");
    await expect(splash).toBeVisible();
    await expect(splash).toHaveAttribute("data-surface", "web");

    // Kabul kriteri 1 — aurora kabuğun ilk çocuğu, kolonlarda opak zemin yok.
    const layers = await splash.evaluate((node) => {
      const frame = node.querySelector(".whispr-splash-frame");
      const column = node.querySelector(".whispr-splash-col");
      const panel = node.querySelector(".whispr-splash-panel");

      return {
        columnBackground: column ? getComputedStyle(column).backgroundColor : null,
        firstChildClass: frame?.firstElementChild?.className ?? null,
        panelBackground: panel ? getComputedStyle(panel).backgroundColor : null,
      };
    });

    expect(layers.firstChildClass).toBe("whispr-splash-aurora");
    expect(layers.columnBackground).toBe("rgba(0, 0, 0, 0)");
    expect(layers.panelBackground).toBe("rgba(0, 0, 0, 0)");
  });

  test("işaret halkasıyla eş merkezli, tıklanamaz ve DS wordmark'ı gizli", async ({ page }) => {
    await authenticateAs(page, "alice");
    await holdWorkspaceApi(page);
    await page.goto("/home");

    const splash = page.getByTestId("splash-screen");
    await expect(splash).toBeVisible();

    // Kabul kriteri 2.
    const mark = await splash.evaluate((node) => {
      const ring = node.querySelector(".whispr-splash-ring");
      const box = node.querySelector(".whispr-splash-markbox");
      const wordmark = node.querySelector(".whispr-logo-wordmark");
      const ringRect = ring?.getBoundingClientRect();
      const boxRect = box?.getBoundingClientRect();

      return {
        anchors: node.querySelectorAll("a").length,
        boxSize: boxRect ? [Math.round(boxRect.width), Math.round(boxRect.height)] : null,
        centerDelta:
          ringRect && boxRect
            ? [
                Math.abs(ringRect.x + ringRect.width / 2 - (boxRect.x + boxRect.width / 2)),
                Math.abs(ringRect.y + ringRect.height / 2 - (boxRect.y + boxRect.height / 2)),
              ]
            : null,
        wordmarkDisplay: wordmark ? getComputedStyle(wordmark).display : null,
      };
    });

    expect(mark.wordmarkDisplay).toBe("none");
    expect(mark.anchors).toBe(0);
    expect(mark.boxSize).toEqual([56, 56]);
    expect(mark.centerDelta?.[0]).toBeLessThanOrEqual(0.5);
    expect(mark.centerDelta?.[1]).toBeLessThanOrEqual(0.5);
  });

  test("rozet ve sürüm satırı görünüyor, metinler devir paketinden", async ({ page }) => {
    await authenticateAs(page, "alice");
    await holdWorkspaceApi(page);
    await page.goto("/home");

    const splash = page.getByTestId("splash-screen");
    await expect(splash).toBeVisible();

    // Kabul kriteri 3 ve 6.
    await expect(splash.getByTestId("splash-pill")).toBeVisible();
    await expect(splash.getByTestId("splash-version")).toBeVisible();
    await expect(splash.getByTestId("splash-version")).toHaveText(/^Whispr \S+/);
    const steps = splash.getByTestId("splash-steps");

    await expect(steps.getByText("Bağlanıyor", { exact: true })).toBeVisible();
    await expect(steps.getByText("Neredeyse hazır", { exact: true })).toBeVisible();
    await expect(splash.getByText("Sesli sohbet ve topluluk", { exact: true })).toBeVisible();
  });

  test("420px'lik masaüstü penceresinde ipucu kırpılmıyor", async ({ page }) => {
    await holdDesktopSession(page);
    // 648 × 474 üretim penceresi: 630 × 420 kabuk + saydam gölge payı.
    // Kökteki `zoom: 1.5` düzeni 420 × 280 CSS px'e indirir.
    await page.setViewportSize({ height: 474, width: 648 });
    await page.goto("/desktop/start");

    const splash = page.getByTestId("splash-screen");
    await expect(splash).toBeVisible();
    await expect(splash).toHaveAttribute("data-surface", "desktop");

    // Kabul kriteri 4 — ipucu panelde, sürüm ayrı kolonda ve ikisi birbirini örtmüyor.
    const tip = await splash.evaluate((node) => {
      const element = node.querySelector(".whispr-splash-panel .whispr-splash-tip");
      const version = node.querySelector(".whispr-splash-version");

      if (!element || !version) {
        return null;
      }

      const tipRect = element.getBoundingClientRect();
      const versionRect = version.getBoundingClientRect();

      return {
        clipped: element.scrollWidth > element.clientWidth + 1,
        overlaps:
          tipRect.left < versionRect.right &&
          tipRect.right > versionRect.left &&
          tipRect.top < versionRect.bottom &&
          tipRect.bottom > versionRect.top,
        tipInPanel: element.closest(".whispr-splash-panel") !== null,
        versionInColumn: version.closest(".whispr-splash-col") !== null,
      };
    });

    expect(tip).not.toBeNull();
    expect(tip?.clipped).toBe(false);
    expect(tip?.overlaps).toBe(false);
    expect(tip?.tipInPanel).toBe(true);
    expect(tip?.versionInColumn).toBe(true);
  });

  for (const theme of THEMES) {
    test(`durum tonları ${theme} temasında AA eşiğini geçiyor`, async ({ page }) => {
      await applyParityTheme(page, theme);
      await authenticateAs(page, "alice");
      await holdWorkspaceApi(page);
      await page.goto("/home");

      await expect(page.getByTestId("splash-screen")).toBeVisible();

      // Kabul kriteri 5 — `-soft` tonları temanın kart zemininde okunur olmalı.
      for (const token of ["--success-soft", "--warning-soft", "--danger-soft"]) {
        const ratio = await readContrast(page, token, "--surface-card");
        expect(ratio, `${token} @ ${theme}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  test("hareket azaltma altında animasyon kalmıyor", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await authenticateAs(page, "alice");
    await holdWorkspaceApi(page);
    await page.goto("/home");

    const splash = page.getByTestId("splash-screen");
    await expect(splash).toBeVisible();

    const running = await splash.evaluate((node) =>
      [...node.querySelectorAll<HTMLElement>("*")]
        .map((element) => getComputedStyle(element).animationName)
        .filter((name) => name && name !== "none"),
    );

    expect(running).toEqual([]);
  });

  test("dar görünüm alanında SPEC §6 düzenine geçiyor", async ({ page }) => {
    await authenticateAs(page, "alice");
    await holdWorkspaceApi(page);
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/home");

    const splash = page.getByTestId("splash-screen");
    await expect(splash).toBeVisible();
    await expect(splash).toHaveAttribute("data-layout", "narrow");
    await expect(splash.getByTestId("splash-stepline")).toBeVisible();
    await expect(splash.getByTestId("splash-steps")).toHaveCount(0);
    await expect(splash.getByTestId("splash-pill")).toHaveCount(1);
  });

  test("erişilebilirlik denetimi temiz", async ({ page }) => {
    await authenticateAs(page, "alice");
    await holdWorkspaceApi(page);
    await page.goto("/home");

    await expect(page.getByTestId("splash-screen")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-testid="splash-screen"]')
      .withTags(WCAG_TAGS)
      .analyze();
    const blocking = results.violations.filter((violation) =>
      BLOCKING_IMPACTS.has(violation.impact ?? ""),
    );

    expect(blocking.map((violation) => violation.id)).toEqual([]);
  });
});
