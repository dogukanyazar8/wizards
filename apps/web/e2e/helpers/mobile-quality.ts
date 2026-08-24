import type { Locator, Page } from "@playwright/test";
import { expect } from "../fixtures/test";
import { visibleTestId } from "./navigation";

export type MobileQualityViewport = {
  height: number;
  name: string;
  orientation: "landscape" | "portrait";
  tier: "phone" | "tablet";
  width: number;
};

export type MobileClientPreferenceScenario = {
  colorScheme: "dark" | "light";
  locale: "en" | "tr";
  name: string;
  reducedMotion: "no-preference" | "reduce";
  theme: "theme-dark" | "theme-light";
};

export const mobilePortraitViewports = [
  { height: 800, name: "360x800", orientation: "portrait", tier: "phone", width: 360 },
  { height: 844, name: "390x844", orientation: "portrait", tier: "phone", width: 390 },
  { height: 932, name: "430x932", orientation: "portrait", tier: "phone", width: 430 },
  { height: 1024, name: "768x1024", orientation: "portrait", tier: "tablet", width: 768 },
] as const satisfies readonly MobileQualityViewport[];

export const mobileLandscapeSmokeViewports = [
  { height: 390, name: "844x390", orientation: "landscape", tier: "phone", width: 844 },
] as const satisfies readonly MobileQualityViewport[];

export const mobileQualityViewports = [
  ...mobilePortraitViewports,
  ...mobileLandscapeSmokeViewports,
] as const satisfies readonly MobileQualityViewport[];

export const defaultMobileViewport = mobilePortraitViewports[1];

export const mobileClientPreferenceScenarios = [
  {
    colorScheme: "light",
    locale: "en",
    name: "en-light-motion",
    reducedMotion: "no-preference",
    theme: "theme-light",
  },
  {
    colorScheme: "dark",
    locale: "tr",
    name: "tr-dark-reduced-motion",
    reducedMotion: "reduce",
    theme: "theme-dark",
  },
] as const satisfies readonly MobileClientPreferenceScenario[];

export async function seedMobileClientPreferences(
  page: Page,
  scenario: Pick<MobileClientPreferenceScenario, "locale" | "theme">,
): Promise<void> {
  await page.addInitScript(({ locale, theme }) => {
    window.localStorage.setItem("wizards.locale", locale);
    window.localStorage.setItem("wizards-theme", theme);
    document.cookie = `wizards.locale=${locale}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = locale;
    document.documentElement.classList.add(theme);
    document.documentElement.dataset.theme = theme === "theme-dark" ? "dark" : "light";
    document.documentElement.style.colorScheme = theme === "theme-dark" ? "dark" : "light";
  }, scenario);
}

export async function useMobileViewport(
  page: Page,
  viewport: Pick<MobileQualityViewport, "height" | "width">,
  options: Pick<MobileClientPreferenceScenario, "colorScheme" | "reducedMotion"> = {
    colorScheme: "light",
    reducedMotion: "no-preference",
  },
): Promise<void> {
  await page.setViewportSize({ height: viewport.height, width: viewport.width });
  await page.emulateMedia({
    colorScheme: options.colorScheme,
    reducedMotion: options.reducedMotion,
  });
}

export async function expectNoHorizontalOverflow(
  page: Page,
  options: { maxDelta?: number; timeout?: number } = {},
): Promise<void> {
  const maxDelta = options.maxDelta ?? 2;

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const maxScrollWidth = Math.max(
            document.body.scrollWidth,
            document.documentElement.scrollWidth,
          );

          return maxScrollWidth - window.innerWidth;
        }),
      { timeout: options.timeout ?? 5_000 },
    )
    .toBeLessThanOrEqual(maxDelta);
}

export async function expectFitsViewport(
  page: Page,
  locator: Locator,
  options: { allowVerticalScroll?: boolean; timeout?: number } = {},
): Promise<void> {
  await expect(locator).toBeVisible({ timeout: options.timeout ?? 10_000 });

  await expect
    .poll(
      async () => {
        const [box, viewport] = await Promise.all([
          locator.boundingBox(),
          Promise.resolve(page.viewportSize()),
        ]);

        if (!box || !viewport) {
          return false;
        }

        const fitsHorizontally = box.x >= -2 && box.x + box.width <= viewport.width + 2;

        if (options.allowVerticalScroll) {
          const intersectsViewport = box.y < viewport.height - 2 && box.y + box.height > 2;

          return fitsHorizontally && intersectsViewport;
        }

        return (
          fitsHorizontally &&
          box.y >= -2 &&
          box.y + Math.min(box.height, viewport.height) <= viewport.height + 2
        );
      },
      { timeout: options.timeout ?? 5_000 },
    )
    .toBe(true);
}

export async function expectMobileSurfaceHealthy(
  page: Page,
  locator: Locator,
  options: { allowVerticalScroll?: boolean; timeout?: number } = {},
): Promise<void> {
  await expectFitsViewport(page, locator, options);
  await expectNoHorizontalOverflow(page);
}

export async function expectInteractionWithinBudget(
  label: string,
  action: () => Promise<void>,
  maxDurationMs = 2_500,
): Promise<void> {
  const startedAt = Date.now();
  await action();
  const durationMs = Date.now() - startedAt;

  expect(durationMs, `${label} should finish within ${maxDurationMs}ms`).toBeLessThanOrEqual(
    maxDurationMs,
  );
}

export async function expectComposerInputBudget(
  page: Page,
  content: string,
  maxDurationMs = 3_000,
): Promise<void> {
  const input = visibleTestId(page, "message-input");
  const startedAt = Date.now();

  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();
  await input.fill("");
  await input.click();
  await page.keyboard.type(content, { delay: 0 });
  await expect(input).toHaveValue(content);

  const durationMs = Date.now() - startedAt;
  expect(
    durationMs,
    `composer input should stay responsive under ${maxDurationMs}ms`,
  ).toBeLessThanOrEqual(maxDurationMs);
}

export async function expectVisibleTestIdCountAtMost(
  page: Page,
  testId: string,
  maxCount: number,
): Promise<void> {
  await expect
    .poll(() => page.locator(`[data-testid="${testId}"]:visible`).count(), { timeout: 5_000 })
    .toBeLessThanOrEqual(maxCount);
}
