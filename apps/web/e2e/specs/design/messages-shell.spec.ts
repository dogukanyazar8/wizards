import { HOME_METRICS } from "@/lib/home/metrics";
import { MESSAGES_METRICS } from "@/lib/messages/metrics";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { expectNoOverflow } from "../../helpers/design-parity";
import { gotoAppRoute } from "../../helpers/navigation";

/**
 * Mesajlar kabuğu — SPEC-MESAJLAR §1, karar #2.
 *
 * Ekran dört kolon: sunucu rayı + gezinme paneli + sohbet rayı + ana alan. İlk üçü sabit;
 * artan genişliğin tamamını ana alan alır.
 *
 * Sayılar `MESSAGES_METRICS` / `HOME_METRICS` sözlüklerinde ve birim testleriyle
 * kilitli. Buradaki koşu onların **ekranda** karşılığını doğruluyor: rem tabanlı
 * bir genişlik yanlış kök font boyutuyla farklı bir piksele oturur ve bunu
 * yalnız gerçek tarayıcı gösterir.
 */

/**
 * ×1 ölçekte üç sol kolon. Sayılar sözlükten okunur: gezinme paneli kabuğun malıdır ve
 * Mesajlar paketi dışında genişletildi (`NAV_PANEL_ADJUSTMENTS`: 228 -> 280). Burada bir kopya
 * tutmak, kabuk her değiştiğinde bu dosyayı sessizce yalancı yapardı.
 */
const LEFT_COLUMNS_TOTAL =
  HOME_METRICS.rail.width + HOME_METRICS.panel.width + MESSAGES_METRICS.layout.railWidth;

async function openMessages(page: Parameters<typeof loginAs>[0]) {
  await gotoAppRoute(page, "/messages", { readyTestId: "messages-rail" });
  await expect(page.getByTestId("messages-rail")).toBeVisible();
}

test.describe("Mesajlar kabuğu", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "alice");
  });

  test("dört kolon, ilk üçü sabit genişlikte", async ({ page }) => {
    await page.setViewportSize({ height: 920, width: 1360 });
    await openMessages(page);

    const railBox = await page.getByTestId("messages-rail").boundingBox();

    expect(railBox?.width).toBeCloseTo(MESSAGES_METRICS.layout.railWidth, 0);

    // Gezinme paneli Mesajlar'da da görünür — karar #2'nin tek görünür sonucu.
    await expect(page.getByTestId("app-nav-panel")).toBeVisible();

    await expectNoOverflow(page);
  });

  test("artan genişliği yalnız ana alan alır", async ({ page }) => {
    await page.setViewportSize({ height: 920, width: 1360 });
    await openMessages(page);
    const narrow = await page.getByTestId("messages-rail").boundingBox();

    await page.setViewportSize({ height: 1080, width: 1920 });
    await expect(page.getByTestId("messages-rail")).toBeVisible();

    /*
     * Ölçek adımı **istemcide** hesaplanıyor: `setViewportSize` sadece görünüm
     * alanını değiştirir, React'in yeniden render etmesi bir sonraki kareye
     * kalır. Hemen ölçmek, henüz büyümemiş rayı okumak olurdu — ve testi
     * "ölçek çalışmıyor" diye yanlış yere yönlendirirdi.
     */
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
      .toBe("18px");

    const wide = await page.getByTestId("messages-rail").boundingBox();

    // ×1.15 adımında kök font boyutu 16 → 18 olur, yani ray da rem'iyle birlikte
    // büyür. Büyümesi **oranlıdır**: kolon sayısı değil, ölçek değişir.
    expect(wide?.width).toBeGreaterThan(narrow?.width ?? 0);
    await expectNoOverflow(page);
  });

  test("sohbet rayı 960'ın altında drawer'a taşınır", async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1200 });
    await openMessages(page);
    await expect(page.getByTestId("messages-rail")).toBeVisible();

    await page.setViewportSize({ height: 900, width: 900 });
    await expect(page.getByTestId("messages-rail")).toBeHidden();
    await expect(page.getByTestId("mobile-workspace-drawer-button")).toBeVisible();
  });

  test("asgari kabukta üç sol kolonun toplamı sözlüğün verdiği genişliktir", async ({ page }) => {
    await page.setViewportSize({ height: 920, width: 1360 });
    await openMessages(page);

    const measured = await page.evaluate(() => {
      const serverRail = document.querySelector('[data-testid="server-rail"]');
      const rail = document.querySelector('[data-testid="messages-rail"]');

      if (!serverRail || !rail) {
        return 0;
      }

      return rail.getBoundingClientRect().right - serverRail.getBoundingClientRect().left;
    });

    /*
     * Üç sol kolonun toplamı: **sunucu rayının solundan** sohbet rayının sağına.
     *
     * Rayın sağ kenarını mutlak olarak okumak yanlıştı: kabuğun kendi dış
     * boşluğu (12px) o sayıya giriyor ve sözlüğün verdiği üç kolon
     * genişliğidir, sayfanın kenar boşluğu değil. Aradaki bir kenarlık
     * ya da boşluk bu farka yine girer — ölçüm iki uç arasından okunuyor.
     */
    expect(measured).toBeCloseTo(LEFT_COLUMNS_TOTAL, 0);
  });
});
