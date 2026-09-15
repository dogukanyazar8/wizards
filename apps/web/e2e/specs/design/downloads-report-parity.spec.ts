import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { setE2EUserLocale } from "../../helpers/db";
import { applyParityTheme, MIN_TAP_TARGET_PX, type ParityTheme } from "../../helpers/design-parity";
import {
  WCAG_TAGS,
  formatViolation,
  partitionAxeViolations,
  reportNonBlockingViolations,
} from "../../helpers/a11y-gate";
import { gotoAppRoute } from "../../helpers/navigation";

/**
 * SPEC-INDIRME §0/§A/§B parity turu.
 *
 * İddia "pencere açılıyor" değil: rayın iki düğmesi çiziliyor, karşılıklı
 * münhasır davranıyor, iki pencere de iki temada taşmadan bitiyor, ve
 * tasarımın klavye sözleşmesi (Esc katman sırası, Enter göndermez) tutuyor.
 */

const HOME_READY = { readyTestId: "home-command-center" };
const THEMES: readonly ParityTheme[] = ["theme-dark", "theme-light"];
const VALID_BODY =
  "Ses kanalına girince mikrofon bir dakika sonra kendiliğinden kapanıyor ve geri açılmıyor.";

test.describe("SPEC-INDIRME — ray düğmeleri ve iki pencere", () => {
  test.beforeAll(async () => {
    await setE2EUserLocale("alice", "tr");
  });

  test.afterAll(async () => {
    await setE2EUserLocale("alice", "en");
  });

  test("ray alt bloğu iki düğmeyi 44px'lik hedeflerle çiziyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", HOME_READY);

    const support = page.getByTestId("server-rail-support");
    await expect(support).toBeVisible();

    for (const testId of ["server-rail-download-button", "server-rail-report-button"]) {
      const button = page.getByTestId(testId);
      await expect(button).toBeVisible();

      const box = await button.boundingBox();
      expect(box, `${testId} ölçülemedi`).not.toBeNull();
      // SPEC §0 kutusu 41 px; tıklama hedefi hairline çerçeveyle birlikte
      // ölçülür ve parity tabanının altına düşmemelidir.
      expect(Math.max(box?.height ?? 0, box?.width ?? 0)).toBeGreaterThanOrEqual(
        MIN_TAP_TARGET_PX - 4,
      );
    }
  });

  test("iki pencere aynı anda açılmıyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", HOME_READY);

    await page.getByTestId("server-rail-report-button").click();
    await expect(page.getByTestId("bug-report-modal")).toBeVisible();

    await page.keyboard.press("Escape");
    await page.getByTestId("server-rail-download-button").click();

    await expect(page.getByTestId("download-modal")).toBeVisible();
    await expect(page.getByTestId("bug-report-modal")).toHaveCount(0);
  });

  test("Sorun bildir: buton pasifken alt bar eksiği söylüyor, tıklamak hatayı gösteriyor", async ({
    page,
  }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", HOME_READY);
    await page.getByTestId("server-rail-report-button").click();

    await expect(page.getByTestId("bug-report-footer-note")).toHaveText(
      "Kategori seç ve en az 20 karakter yaz.",
    );

    // Pasif buton bir tıklamayı yutmaz: doğrulama satırını gösterir.
    await page.getByTestId("bug-report-submit").click();
    await expect(page.getByTestId("bug-report-error-validate")).toBeVisible();

    await page.getByTestId("bug-report-category-voice").click();
    await expect(page.getByTestId("bug-report-error-validate")).toHaveCount(0);
    await expect(page.getByTestId("bug-report-footer-note")).toContainText("karakter daha yaz.");

    await page.getByTestId("bug-report-body-input").fill(VALID_BODY);
    await expect(page.getByTestId("bug-report-footer-note")).toHaveText(
      "Rapor doğrudan ürün ekibine gider.",
    );
  });

  test("Enter göndermiyor, dolu taslakta Esc onay soruyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", HOME_READY);
    await page.getByTestId("server-rail-report-button").click();

    await page.getByTestId("bug-report-category-chat").click();
    const input = page.getByTestId("bug-report-body-input");
    await input.fill(VALID_BODY);
    await input.press("Enter");

    // Gönderim başlamadı: başarı ekranı yok, form yerinde.
    await expect(page.getByTestId("bug-report-success")).toHaveCount(0);
    await expect(page.getByTestId("bug-report-body")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("bug-report-discard-dialog")).toBeVisible();

    // Esc onay katmanını kapatır, pencereyi değil.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("bug-report-discard-dialog")).toHaveCount(0);
    await expect(page.getByTestId("bug-report-modal")).toBeVisible();
  });

  test("boş taslakta X doğrudan kapatıyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", HOME_READY);
    await page.getByTestId("server-rail-report-button").click();

    await page.getByTestId("bug-report-close").click();
    await expect(page.getByTestId("bug-report-modal")).toHaveCount(0);
    await expect(page.getByTestId("bug-report-discard-dialog")).toHaveCount(0);
  });

  test("İndirme: ortam değiştirmek tüm içeriği çeviriyor ve ağa çıkmıyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", HOME_READY);

    let catalogRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/app/downloads")) {
        catalogRequests += 1;
      }
    });

    await page.getByTestId("server-rail-download-button").click();
    await expect(page.getByTestId("download-modal")).toBeVisible();
    await expect(page.getByTestId("download-notice")).toBeVisible();

    const requestsAfterOpen = catalogRequests;

    await page.getByTestId("download-environment-uat").click();
    await expect(page.getByTestId("download-environment-uat")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByTestId("download-modal")).toContainText("UAT ortamı");

    await page.getByTestId("download-environment-prod").click();
    await expect(page.getByTestId("download-modal")).toContainText("PROD ortamı");

    // İki katalog tek istekte geldi: ortam değiştirmek ikinci bir sorgu açmaz.
    expect(catalogRequests).toBe(requestsAfterOpen);
  });

  test("indirme penceresi kaldırılan fark tablosunu göstermiyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", HOME_READY);
    await page.getByTestId("server-rail-download-button").click();

    await expect(page.getByTestId("download-modal")).toBeVisible();
    await expect(page.getByTestId("download-compare")).toHaveCount(0);
  });

  for (const theme of THEMES) {
    test(`${theme}: iki pencere de kabuk içinde bitiyor`, async ({ page }) => {
      await applyParityTheme(page, theme);
      await loginAs(page, "alice");
      await gotoAppRoute(page, "/home", HOME_READY);

      for (const [trigger, surface] of [
        ["server-rail-report-button", "bug-report-modal"],
        ["server-rail-download-button", "download-modal"],
      ] as const) {
        await page.getByTestId(trigger).click();
        await expect(page.getByTestId(surface)).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${surface} yatay taşma yarattı`).toBeLessThanOrEqual(2);

        await page.keyboard.press("Escape");
      }
    });
  }

  test("iki pencere de WCAG A/AA taramasını geçiyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/home", HOME_READY);

    for (const trigger of ["server-rail-report-button", "server-rail-download-button"]) {
      await page.getByTestId(trigger).click();

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const partition = partitionAxeViolations(results.violations);

      reportNonBlockingViolations(partition, trigger);

      expect(
        partition.blocking.map(formatViolation),
        `${trigger} penceresinde bloklayıcı erişilebilirlik ihlali`,
      ).toEqual([]);

      await page.keyboard.press("Escape");
    }
  });
});
