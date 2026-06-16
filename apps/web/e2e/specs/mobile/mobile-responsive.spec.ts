import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EServerRoute } from "../../helpers/db";
import { sendComposerMessage } from "../../helpers/messages";

const mobileViewports = [
  { height: 800, name: "360x800", width: 360 },
  { height: 844, name: "390x844", width: 390 },
  { height: 932, name: "430x932", width: 430 },
  { height: 1024, name: "768x1024", width: 768 },
] as const;

const defaultMobileViewport = mobileViewports[1];

async function useViewport(
  page: Page,
  viewport: { height: number; width: number },
): Promise<void> {
  await page.setViewportSize({ height: viewport.height, width: viewport.width });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
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
    .toBeLessThanOrEqual(2);
}

async function expectFitsViewport(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();

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

        return box.x >= -2 && box.x + box.width <= viewport.width + 2;
      },
      { timeout: 5_000 },
    )
    .toBe(true);
}

async function sendMessage(page: Page, content: string): Promise<void> {
  await sendComposerMessage(page, content);
}

function messageByText(page: Page, content: string): Locator {
  return page.getByTestId("message-item").filter({ hasText: content }).last();
}

test.describe("mobile responsive experience", () => {
  for (const viewport of mobileViewports) {
    test(`auth pages fit ${viewport.name}`, async ({ page }) => {
      await useViewport(page, viewport);

      await page.goto("/login");
      await expect(page.getByTestId("login-form")).toBeVisible();
      await expectFitsViewport(page, page.getByTestId("auth-panel"));
      await expectNoHorizontalOverflow(page);

      await page.goto("/register");
      await expect(page.getByTestId("register-form")).toBeVisible();
      await expectFitsViewport(page, page.getByTestId("auth-panel"));
      await expectNoHorizontalOverflow(page);
    });
  }

  test("workspace drawer opens and closes without mobile overflow", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await useViewport(page, defaultMobileViewport);
    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);

    await page.getByTestId("mobile-workspace-drawer-button").click();

    const drawer = page.getByTestId("mobile-workspace-drawer");
    await expectFitsViewport(page, drawer);
    await expect(drawer.getByTestId("server-rail")).toBeVisible();
    await expect(drawer.getByTestId("channel-sidebar").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("channel back control opens the mobile channel drawer", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await useViewport(page, defaultMobileViewport);
    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);

    await page.getByTestId("mobile-shell-back-button").click();

    const drawer = page.getByTestId("mobile-workspace-drawer");
    await expectFitsViewport(page, drawer);
    await expect(drawer.getByTestId("channel-sidebar").first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("mobile chat composer can send messages without layout overflow", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const content = `Mobile composer message ${Date.now()}`;

    await useViewport(page, defaultMobileViewport);
    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);

    await expectFitsViewport(page, page.getByTestId("message-composer"));
    await sendMessage(page, content);
    await expect(messageByText(page, content)).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalOverflow(page);
  });

  test("mobile message actions use the compact menu and reaction sheet", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const content = `Mobile actions target ${Date.now()}`;
    const emoji = "\u{1F44D}";

    await useViewport(page, defaultMobileViewport);
    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);
    await sendMessage(page, content);

    const message = messageByText(page, content);
    await expect(message).toBeVisible({ timeout: 10_000 });
    await message.getByTestId("message-mobile-actions").click();
    const toolbar = message.locator('[data-testid="message-toolbar"]:visible');
    await expect(toolbar).toBeVisible();
    await toolbar.getByTestId("message-action-react").click();

    const reactionPicker = page.getByTestId("reaction-picker");
    await expectFitsViewport(page, reactionPicker);
    await page.getByTestId("reaction-option").filter({ hasText: emoji }).click();
    await expect(
      message.getByTestId("message-reaction").filter({ hasText: `${emoji} 1` }),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("mobile settings navigation stays inside the viewport", async ({ page }) => {
    await useViewport(page, { height: 800, width: 360 });
    await loginAs(page, "alice");
    await page.goto("/settings");

    await expectFitsViewport(page, page.getByTestId("settings-mobile-sidebar"));
    await expectNoHorizontalOverflow(page);

    await page.getByTestId("settings-mobile-section-appearance").click();
    await expect(page.getByTestId("settings-mobile-panel-appearance-theme")).toBeVisible();
    await page.getByTestId("settings-mobile-panel-appearance-theme").click();
    await expectNoHorizontalOverflow(page);

    await page.getByTestId("settings-mobile-section-notifications").click();
    await expect(page.getByTestId("settings-mobile-panel-notifications-general")).toBeVisible();
    await page.getByTestId("settings-mobile-panel-notifications-general").click();
    await expectNoHorizontalOverflow(page);
  });

  test("mobile notification popup fits the viewport", async ({ page }) => {
    await useViewport(page, defaultMobileViewport);
    await loginAs(page, "alice");
    await page.goto("/channels/@me");

    await page.getByTestId("mobile-workspace-drawer-button").click();
    await page
      .getByTestId("mobile-workspace-drawer")
      .getByTestId("notification-bell-button")
      .click();

    const popup = page.locator("[data-notification-popup='true']");
    await expectFitsViewport(page, popup);
    await expectNoHorizontalOverflow(page);
  });
});
