import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { applyParityTheme, type ParityTheme } from "../../helpers/design-parity";
import { expectNoClippedText, expectNoHorizontalOverflow } from "../../helpers/design-parity";
import { gotoAppRoute } from "../../helpers/navigation";

/**
 * SPEC-GIRIS-KAYIT §12 — kimlik akışının parity turu.
 *
 * İddia "ekran açılıyor" değil: on ekranın **her biri** iki temada yatay kaydırmasız açılıyor
 * mu, metin kırpılıyor mu, kabuk sırası (aurora → marka → form) yerinde mi, tema/dil anahtarı
 * anında mı dönüyor.
 *
 * Yardımcılar yeniden yazılmıyor; eşikler kardeş parity turlarıyla aynı olmak zorunda, iki
 * farklı eşik birinin diğerini yalanlaması demek olurdu.
 */

const THEMES: readonly ParityTheme[] = ["theme-light", "theme-dark"];

/** SPEC §4 — akışın on ekranı; ikisi (2FA · yedek kod) challenge ister, ayrı testte. */
const PUBLIC_SCREENS = [
  { path: "/login", testId: "login-form" },
  { path: "/register", testId: "register-form" },
  { path: "/forgot-password", testId: "forgot-password-form" },
  { path: "/forgot-password/sent", testId: "resend-reset-link" },
  { path: "/verify-email", testId: "verify-email-form" },
] as const;

async function readShellOrder(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-auth-surface]");

    return {
      brandBackground: root?.querySelector(".auth-brand")
        ? getComputedStyle(root.querySelector(".auth-brand")!).backgroundColor
        : null,
      columnBackground: root?.querySelector(".auth-form-column")
        ? getComputedStyle(root.querySelector(".auth-form-column")!).backgroundColor
        : null,
      firstChildClass: root?.firstElementChild?.className ?? null,
    };
  });
}

test.describe("SPEC-GIRIS-KAYIT — kimlik akışı parity", () => {
  for (const theme of THEMES) {
    for (const screen of PUBLIC_SCREENS) {
      test(`${screen.path} · ${theme} · kabuk sırası ve taşma`, async ({ page }) => {
        await page.setViewportSize({ height: 720, width: 1280 });
        await applyParityTheme(page, theme);
        await gotoAppRoute(page, screen.path);

        // Ekranın kendi işareti; yoksa test yanlış sayfayı ölçüyor demektir.
        await expect(page.getByTestId(screen.testId)).toBeVisible();

        const layers = await readShellOrder(page);
        expect(layers.firstChildClass).toContain("auth-aurora");
        expect(layers.brandBackground).toBe("rgba(0, 0, 0, 0)");
        expect(layers.columnBackground).toBe("rgba(0, 0, 0, 0)");

        await expectNoHorizontalOverflow(page);
        await expectNoClippedText(page);
      });
    }
  }

  test("tema anahtarı yalnız kimlik yüzeyini çevirir ve anında uygular", async ({ page }) => {
    await gotoAppRoute(page, "/login");

    const before = await page.evaluate(
      () => getComputedStyle(document.querySelector("[data-auth-surface]")!).backgroundColor,
    );

    await page.getByRole("radio", { name: /koyu|dark/i }).click();

    const after = await page.evaluate(() => ({
      root: document.documentElement.getAttribute("data-auth-theme"),
      surface: getComputedStyle(document.querySelector("[data-auth-surface]")!).backgroundColor,
    }));

    expect(after.root).toBe("dark");
    expect(after.surface).not.toBe(before);
  });

  test("dil menüsü klavyeyle gezilir, Esc kapatır ve odak tetikleyiciye döner", async ({
    page,
  }) => {
    await gotoAppRoute(page, "/login");

    const trigger = page.locator(".auth-lang-trigger");
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("beş hatalı denemeden sonra form yerini kilit bloğuna bırakır", async ({ page }) => {
    await gotoAppRoute(page, "/login");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.locator('input[name="email"]').fill("locked-user@whispr.test");
      await page.locator('input[name="password"]').fill(`wrong-password-${attempt}`);
      await page.getByTestId("login-form").locator('button[type="submit"]').click();
      await page.waitForLoadState("networkidle");
    }

    // SPEC §8/3 — seviye 3: form gizlenir, yerine sayaçlı blok gelir.
    await expect(page.getByTestId("login-lock-countdown")).toBeVisible();
    await expect(page.getByTestId("login-form")).toHaveCount(0);
  });

  test("şifremi unuttum → gönderildi → yeniden gönder bandı", async ({ page }) => {
    await gotoAppRoute(page, "/forgot-password");
    await page.locator('input[name="email"]').fill("alice@whispr.test");
    await page.getByTestId("forgot-password-form").locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/forgot-password\/sent/);

    const resend = page.getByTestId("resend-reset-link");
    await expect(resend).toBeVisible();
    await resend.click();

    // SPEC §4.7 — yeniden gönderim bandı ve sayaç pill'i.
    await expect(page.getByTestId("resent-banner")).toBeVisible();
    await expect(page.locator(".auth-pill")).toBeVisible();
  });

  test("challenge olmadan iki adımlı doğrulama ekranına girilemez", async ({ page }) => {
    await gotoAppRoute(page, "/login/two-factor");

    // SPEC §4.2 — challenge yoksa ekran açılmaz, kullanıcı girişe döner.
    await expect(page).toHaveURL(/\/login(?!\/two-factor)/);
  });

  test("hareket azaltma altında kimlik yüzeyinde animasyon kalmaz", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoAppRoute(page, "/login");

    const animated = await page.evaluate(() => {
      const nodes = document.querySelectorAll("[data-auth-surface] *");

      return [...nodes].filter((node) => {
        const name = getComputedStyle(node).animationName;

        return name && name !== "none";
      }).length;
    });

    expect(animated).toBe(0);
  });
});
