import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { applyParityTheme, type ParityTheme } from "../../helpers/design-parity";
import {
  WCAG_TAGS,
  formatViolation,
  partitionAxeViolations,
  reportNonBlockingViolations,
} from "../../helpers/a11y-gate";
import { gotoAppRoute } from "../../helpers/navigation";

/**
 * SPEC-GIRIS-KAYIT §11 — kimlik akışının erişilebilirlik taraması.
 *
 * Kaynak düzeyinde ölçülebilen maddeler `components/auth/auth-a11y.test.ts` içinde; burada
 * yalnız tarayıcı gerektirenler var: axe taraması, sekme sırası, canlı bölge duyurusu.
 *
 * Eşikler kardeş a11y turlarıyla ortak yardımcıdan gelir (A + AA; AAA kapsam dışı).
 */

const THEMES: readonly ParityTheme[] = ["theme-light", "theme-dark"];
const SCREENS = ["/login", "/register", "/forgot-password", "/verify-email"] as const;

async function scan(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const partition = partitionAxeViolations(results.violations);

  reportNonBlockingViolations(partition, label);

  expect(partition.blocking.map(formatViolation), `${label} engelleyici ihlal taşıyor`).toEqual([]);
}

test.describe("SPEC-GIRIS-KAYIT — erişilebilirlik", () => {
  for (const theme of THEMES) {
    for (const route of SCREENS) {
      test(`${route} · ${theme} · axe A+AA`, async ({ page }) => {
        await applyParityTheme(page, theme);
        await gotoAppRoute(page, route);
        await scan(page, `${route} (${theme})`);
      });
    }
  }

  test("sekme sırası görsel sırayla aynı ilerler", async ({ page }) => {
    await gotoAppRoute(page, "/login");

    const order: string[] = [];

    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(() => {
          const active = document.activeElement;

          return active
            ? `${active.tagName.toLowerCase()}:${active.getAttribute("name") ?? active.getAttribute("aria-label") ?? active.className}`
            : "none";
        }),
      );
    }

    const emailIndex = order.findIndex((entry) => entry.includes("email"));
    const passwordIndex = order.findIndex((entry) => entry.includes("password"));

    expect(emailIndex).toBeGreaterThanOrEqual(0);
    // Görsel sıra e-posta → şifre; sekme bunu tersine çeviremez.
    expect(passwordIndex).toBeGreaterThan(emailIndex);
  });

  test("form üstü bant role=alert ile duyurulur", async ({ page }) => {
    await gotoAppRoute(page, "/login");

    await page.locator('input[name="email"]').fill("nobody@whispr.test");
    await page.locator('input[name="password"]').fill("wrong-password");
    await page.getByTestId("login-form").locator('button[type="submit"]').click();

    const alert = page.getByRole("alert").first();
    await expect(alert).toBeVisible();
    await expect(alert).not.toBeEmpty();
  });

  test("altı kod hücresi ekran okuyucuya tek alan olarak görünür", async ({ page }) => {
    await gotoAppRoute(page, "/verify-email");

    const cells = page.locator(".auth-code-row");
    await expect(cells).toHaveAttribute("aria-hidden", "true");

    const field = page.locator('input[autocomplete="one-time-code"]');
    await expect(field).toHaveAttribute("inputmode", "numeric");
    await expect(field).toHaveJSProperty("maxLength", 6);
  });

  test("kullanılamayan sağlayıcılar erişilebilir adında da kapalı görünür", async ({ page }) => {
    await gotoAppRoute(page, "/login");

    const disabledProviders = page.locator(".auth-provider[aria-disabled='true']");
    await expect(disabledProviders).toHaveCount(2);

    for (const provider of await disabledProviders.all()) {
      const name = await provider.getAttribute("aria-label");
      expect(name ?? "").toMatch(/—/);
    }
  });
});
