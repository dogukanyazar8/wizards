import type { Page } from "@playwright/test";
import { expect } from "../fixtures/test";

/**
 * Tasarım parity yardımcıları.
 *
 * `SPEC-ANA-SAYFA.md` §8.4 her çözünürlükte üç şey ister: kaydırma yok, metin kırpılmıyor, kabuk
 * içinde bitiyor. Bu modül o üç kontrolü ve ölçek adımının okunmasını tek yerde tutar; yeni tasarım
 * spec'i her açıldığında yeniden yazılmasın diye paylaşımlıdır.
 */

/** SPEC §8.2.5 — hiçbir ölçek adımında tıklama hedefi bunun altına düşmez. */
export const MIN_TAP_TARGET_PX = 44;

/** Alt piksel yuvarlamaları taşma sayılmasın. */
const OVERFLOW_TOLERANCE_PX = 2;

export type ParityTheme = "theme-dark" | "theme-light";

/** Tema `ThemeProvider` okumadan önce yerine oturur; ilk boya doğru temada olur. */
export async function applyParityTheme(page: Page, theme: ParityTheme): Promise<void> {
  await page.addInitScript((appliedTheme) => {
    try {
      window.localStorage.setItem("wizards-theme", appliedTheme);
    } catch {
      // `about:blank` gibi depolamasız bir belgede tema zaten uygulanmayacak.
    }

    // Betik belge çözümlenmeden de koşabilir; `documentElement` o anda `null` olur ve
    // sayfada bir `pageerror` bırakırdı. Kök yoksa sınıfı `DOMContentLoaded`'da koyuyoruz.
    const applyRoot = () => {
      const root = document.documentElement;

      if (!root) {
        return false;
      }

      root.classList.add(appliedTheme);
      root.dataset.theme = appliedTheme === "theme-dark" ? "dark" : "light";
      root.style.colorScheme = appliedTheme === "theme-dark" ? "dark" : "light";

      return true;
    };

    if (!applyRoot()) {
      document.addEventListener("DOMContentLoaded", applyRoot, { once: true });
    }
  }, theme);
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
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
      { timeout: 5_000 },
    )
    .toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
}

export async function expectNoVerticalOverflow(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const maxScrollHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
          );

          return maxScrollHeight - window.innerHeight;
        }),
      { timeout: 5_000 },
    )
    .toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
}

/**
 * Kabuk `100vw × 100dvh` doldurur ve `overflow:hidden` çalışır — iki eksende de kaydırma çıkmaz.
 * Ultra geniş ekranda ölçeği yükseklikten sınırlayan kural (SPEC §8.1) burada kırmızıya döner.
 */
export async function expectNoOverflow(page: Page): Promise<void> {
  await expectNoHorizontalOverflow(page);
  await expectNoVerticalOverflow(page);
}

/**
 * Kırpılan metin arar: yatayda taşan, `overflow` gizli ve `text-overflow: ellipsis` **taşımayan**
 * yaprak düğümler. Tasarımın kasıtlı ellipsis'leri elenir, yoksa kontrol gürültüye boğulur.
 */
export async function expectNoClippedText(page: Page): Promise<void> {
  const clipped = await page.evaluate((tolerance) => {
    const offenders: string[] = [];

    for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (element.childElementCount > 0) {
        continue;
      }

      const text = element.textContent?.trim() ?? "";

      if (text.length === 0) {
        continue;
      }

      // Görsel olarak gizlenmiş metin (`sr-only`) **kasten** kırpılır: 1×1
      // kutu + `overflow:hidden` + `nowrap` bu desenin tanımıdır. Onu "kırpılan
      // metin" saymak kontrolü, kartlar boyanmadan ölçüldüğünde yeşil, boyandığında
      // kırmızı yapar — yani gerçek bir kırpmayı değil, zamanlamayı ölçer.
      if (element.clientWidth <= 1 && element.clientHeight <= 1) {
        continue;
      }

      const style = window.getComputedStyle(element);

      if (style.textOverflow === "ellipsis") {
        continue;
      }

      if (style.overflowX !== "hidden" && style.overflowX !== "clip") {
        continue;
      }

      if (element.scrollWidth - element.clientWidth <= tolerance) {
        continue;
      }

      const label = element.getAttribute("data-testid") ?? element.getAttribute("class") ?? "";

      offenders.push(
        `${element.tagName.toLowerCase()}${label === "" ? "" : `[${label}]`} ` +
          `${element.scrollWidth}>${element.clientWidth} — ${text.slice(0, 40)}`,
      );
    }

    return offenders;
  }, OVERFLOW_TOLERANCE_PX);

  expect(clipped).toEqual([]);
}

/** Ölçek adımının tek gözlenebilir çıktısı: kök font boyutu (SPEC §8.1). */
export async function readRootFontSize(page: Page): Promise<number> {
  return page.evaluate(() =>
    Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize),
  );
}

/** Hydration sonrası responsive kök ölçeğinin yerleşmesini bekler ve ölçülen değeri döndürür. */
export async function waitForRootFontSize(
  page: Page,
  expected: number,
  timeout = 10_000,
): Promise<number> {
  let actual = await readRootFontSize(page);

  await expect
    .poll(
      async () => {
        actual = await readRootFontSize(page);
        return actual;
      },
      { timeout },
    )
    .toBeCloseTo(expected, 1);

  return actual;
}

/** Bir tıklama hedefinin ölçülmüş hâli — kimliği `data-testid`, boyu CSS pikseli. */
export type TapTargetMeasurement = {
  height: number;
  label: string;
  testId: string | null;
  width: number;
};

/**
 * `minSize` altında kalan her tıklama hedefini **ölçer**, atmaz.
 *
 * Faz 8 §1 tasarım↔spec çelişkisini sayıyla kapatmak zorunda: SPEC §8.2.5 44px taban istiyor,
 * tasarımın kendi ölçüleri (arkadaş kartı 28+2×7, durum çipi, toggle) altında kalıyor. Ölçüm
 * ile kabul ayrı tutulur; kabul listesi spec'te yazılı, ölçüm burada.
 */
export async function collectUndersizedTapTargets(
  page: Page,
  selector: string,
  minSize: number = MIN_TAP_TARGET_PX,
): Promise<TapTargetMeasurement[]> {
  return page.evaluate(
    ({ minTapSize, targetSelector }) =>
      Array.from(document.querySelectorAll<HTMLElement>(targetSelector))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0)
        .filter(({ rect }) => rect.width + 0.5 < minTapSize || rect.height + 0.5 < minTapSize)
        .map(({ element, rect }) => ({
          height: Math.round(rect.height * 10) / 10,
          label:
            element.getAttribute("data-testid") ??
            element.getAttribute("aria-label") ??
            element.getAttribute("class") ??
            element.tagName.toLowerCase(),
          testId: element.getAttribute("data-testid"),
          width: Math.round(rect.width * 10) / 10,
        })),
    { minTapSize: minSize, targetSelector: selector },
  );
}

export async function expectMinTapTarget(page: Page, selector: string): Promise<void> {
  const undersized = await collectUndersizedTapTargets(page, selector);

  expect(
    undersized.map(
      (target) => `${target.label} ${Math.round(target.width)}×${Math.round(target.height)}`,
    ),
  ).toEqual([]);
}
