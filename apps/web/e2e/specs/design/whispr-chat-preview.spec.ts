import { expect, test } from "../../fixtures/test";
import { expectNoHorizontalOverflow } from "../../helpers/design-parity";

test.describe("Whispr chat design preview", () => {
  test("desktop keeps the full four-panel layout visible", async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto("/design/whispr-chat");

    await expect(page.getByTestId("whispr-chat-preview")).toBeVisible();
    await expect(page.getByTestId("whispr-server-rail")).toBeVisible();
    await expect(page.getByTestId("whispr-channel-sidebar")).toBeVisible();
    await expect(page.getByTestId("whispr-chat-panel")).toBeVisible();
    await expect(page.getByTestId("whispr-members-sidebar")).toBeVisible();
    await expect(page.getByTestId("whispr-chat-composer")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("laptop opens members as a right drawer below the full desktop breakpoint", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 800, width: 1280 });
    await page.goto("/design/whispr-chat");

    await expect(page.locator('[data-testid="whispr-members-sidebar"]:visible')).toHaveCount(0);
    await page.getByTestId("whispr-members-panel-button").click();

    const drawer = page.getByTestId("whispr-members-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("whispr-members-sidebar")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("tablet uses the channel drawer while keeping the compact rail", async ({ page }) => {
    await page.setViewportSize({ height: 1024, width: 768 });
    await page.goto("/design/whispr-chat");

    await expect(page.getByTestId("whispr-server-rail")).toBeVisible();
    await page.getByTestId("whispr-channel-menu-button").click();

    const drawer = page.getByTestId("whispr-channel-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("whispr-channel-sidebar")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await drawer.getByTestId("whispr-channel-drawer-overlay").click();
    await expect(drawer).toBeHidden();
  });

  test("mobile keeps chat primary and opens search as an overlay", async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto("/design/whispr-chat");

    await expect(page.getByTestId("whispr-server-rail")).toBeHidden();
    await expect(page.getByTestId("whispr-chat-panel")).toBeVisible();
    await expect(page.getByTestId("whispr-chat-composer")).toBeVisible();

    await page.getByTestId("whispr-search-button").click();
    await expect(page.getByTestId("whispr-search-overlay")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
