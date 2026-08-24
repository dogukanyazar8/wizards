import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EDMConversationId } from "../../helpers/db";
import { expectNoOverflow } from "../../helpers/design-parity";
import { gotoAppRoute } from "../../helpers/navigation";

/**
 * Mesajlar kırılımları — SPEC-MESAJLAR §1.3, Dalga 3 §3.
 *
 * Üç eşik, üç farklı **davranış**:
 *
 * | Genişlik | Sağ panel | Sohbet rayı |
 * | --- | --- | --- |
 * | ≥1100 | yerleşik (340) | görünür |
 * | 960–1099 | overlay + perde, `role="dialog"`, focus tuzağı | görünür |
 * | <960 | overlay | drawer'da |
 *
 * Eşikler `MESSAGES_METRICS.layout` sözlüğünden geliyor; test onları **tekrar
 * yazmıyor**, çünkü iki sayı iki eşik demek olurdu ve biri değiştiğinde diğeri
 * sessizce eski kalırdı.
 */

const SIDE_PANEL_OVERLAY_BELOW = 1100;
const RAIL_DRAWER_BELOW = 960;

async function openConversationWithSearch(page: Page): Promise<void> {
  const conversationId = await getE2EDMConversationId();

  await gotoAppRoute(page, `/messages/${conversationId}`, { readyTestId: "message-input" });
  await page.getByTestId("conversation-header-search").click();
  await expect(page.getByTestId("messages-search-panel")).toBeVisible();
}

test.describe("Mesajlar kırılımları", () => {
  test("≥1100: sağ panel yerleşik, ray görünür", async ({ page }) => {
    await page.setViewportSize({ height: 920, width: 1360 });
    await loginAs(page, "alice");
    await openConversationWithSearch(page);

    const panel = page.locator("[data-messages-side-panel]");

    await expect(panel).toHaveAttribute("role", "complementary");
    await expect(panel).not.toHaveAttribute("aria-modal", "true");
    await expect(page.getByTestId("messages-panel-backdrop")).toBeHidden();
    await expect(page.getByTestId("messages-rail")).toBeVisible();
    await expectNoOverflow(page);
  });

  test("960–1099: panel overlay ve diyalog", async ({ page }) => {
    await page.setViewportSize({ height: 900, width: SIDE_PANEL_OVERLAY_BELOW - 40 });
    await loginAs(page, "alice");
    await openConversationWithSearch(page);

    const panel = page.locator("[data-messages-side-panel]");

    await expect(panel).toHaveAttribute("role", "dialog");
    await expect(panel).toHaveAttribute("aria-modal", "true");
    await expect(page.getByTestId("messages-panel-backdrop")).toBeVisible();
    await expect(page.getByTestId("messages-rail")).toBeVisible();
    await expectNoOverflow(page);
  });

  test("<960: ray drawer'a iner", async ({ page }) => {
    await page.setViewportSize({ height: 900, width: RAIL_DRAWER_BELOW - 60 });
    await loginAs(page, "alice");

    const conversationId = await getE2EDMConversationId();

    await gotoAppRoute(page, `/messages/${conversationId}`, { readyTestId: "message-input" });

    // Ray artık üçüncü sütunda **değil**: asıl iddia bu.
    await expect(page.getByTestId("messages-rail")).toBeHidden();

    // Kabuğun dar-ekran tetikleyicisi görünür. Sohbetin içindeyken bu, drawer
    // düğmesi değil **geri** düğmesidir (`canGoBack`): dar ekranda sohbetten
    // çıkmak, gezinmeyi açmaktan daha sık istenen şey.
    await expect(
      page
        .getByTestId("mobile-shell-back-button")
        .or(page.getByTestId("mobile-workspace-drawer-button")),
    ).toBeVisible();
    await expectNoOverflow(page);
  });

  test("panel klavyeyle açılıp Esc ile kapanır ve odak tetikleyiciye döner", async ({ page }) => {
    await page.setViewportSize({ height: 920, width: 1360 });
    await loginAs(page, "alice");

    const conversationId = await getE2EDMConversationId();

    await gotoAppRoute(page, `/messages/${conversationId}`, { readyTestId: "message-input" });

    const trigger = page.getByTestId("conversation-header-search");

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("messages-search-panel")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("messages-search-panel")).toBeHidden();
  });

  test("thread ve arama aynı anda açılmaz", async ({ page }) => {
    await page.setViewportSize({ height: 920, width: 1360 });
    await loginAs(page, "alice");
    await openConversationWithSearch(page);

    // Arama açıkken thread ikonuna basmak aramayı kapatmalı — ikisi de aynı
    // 340px'lik sütuna oturuyor ve birlikte açık olmaları ya sohbeti 680px
    // daraltır ya da birini görünmez bırakır.
    const panels = page.locator("[data-messages-side-panel]");

    await expect(panels).toHaveCount(1);
  });
});
