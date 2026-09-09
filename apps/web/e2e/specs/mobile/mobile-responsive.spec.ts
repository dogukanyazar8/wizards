import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EServerRoute } from "../../helpers/db";
import {
  defaultMobileViewport,
  expectComposerInputBudget,
  expectInteractionWithinBudget,
  expectMobileSurfaceHealthy,
  expectNoHorizontalOverflow,
  expectVisibleTestIdCountAtMost,
  mobileClientPreferenceScenarios,
  mobileLandscapeSmokeViewports,
  mobilePortraitViewports,
  seedMobileClientPreferences,
  useMobileViewport,
} from "../../helpers/mobile-quality";
import { sendComposerMessage } from "../../helpers/messages";
import { gotoAppRoute, gotoTextChannelRoute, visibleTestId } from "../../helpers/navigation";

async function sendMessage(page: Page, content: string): Promise<void> {
  await sendComposerMessage(page, content);
}

function messageByText(page: Page, content: string): Locator {
  return page.getByTestId("message-item").filter({ hasText: content }).last();
}

test.describe("mobile responsive experience", () => {
  for (const viewport of mobilePortraitViewports) {
    test(`auth pages fit ${viewport.name}`, async ({ page }) => {
      await useMobileViewport(page, viewport);

      await page.goto("/login");
      await expect(page.getByTestId("login-form")).toBeVisible();
      await expectMobileSurfaceHealthy(page, page.getByTestId("auth-panel"));

      await expect(page.getByTestId("login-form")).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.goto("/register");
      await expect(page.getByTestId("register-form")).toBeVisible();
      await expectMobileSurfaceHealthy(page, page.getByTestId("auth-panel"));
      await expectNoHorizontalOverflow(page);
    });
  }

  for (const scenario of mobileClientPreferenceScenarios) {
    test(`auth pages honor ${scenario.name}`, async ({ page }) => {
      await seedMobileClientPreferences(page, scenario);
      await useMobileViewport(page, defaultMobileViewport, scenario);

      await page.goto("/login");
      await expect(page.getByTestId("login-form")).toBeVisible();
      await expectMobileSurfaceHealthy(page, page.getByTestId("auth-panel"), {
        allowVerticalScroll: true,
      });
      await expect
        .poll(() =>
          page.evaluate(() => ({
            lang: document.documentElement.lang,
            theme: document.documentElement.dataset.theme,
          })),
        )
        .toEqual({
          lang: scenario.locale,
          theme: scenario.colorScheme,
        });
    });
  }

  for (const viewport of mobileLandscapeSmokeViewports) {
    test(`landscape auth smoke has no overflow ${viewport.name}`, async ({ page }) => {
      await useMobileViewport(page, viewport, {
        colorScheme: "light",
        reducedMotion: "reduce",
      });

      await page.goto("/login");
      await expect(page.getByTestId("login-form")).toBeVisible();
      await expectMobileSurfaceHealthy(page, page.getByTestId("auth-panel"), {
        allowVerticalScroll: true,
      });
    });
  }

  test("workspace drawer opens and closes without mobile overflow", async ({ page }) => {
    await useMobileViewport(page, defaultMobileViewport);
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/messages", {
      readyTestId: "mobile-workspace-drawer-button",
    });

    await expectInteractionWithinBudget(
      "mobile workspace drawer open",
      async () => {
        await page.getByTestId("mobile-workspace-drawer-button").click();
        await expect(page.getByTestId("mobile-workspace-drawer")).toBeVisible();
      },
      3_500,
    );

    const drawer = page.getByTestId("mobile-workspace-drawer");
    await expectMobileSurfaceHealthy(page, drawer);
    await expect(drawer.getByTestId("server-rail")).toBeVisible();
    // Mesajlar kendi rotasına taşındıktan sonra çekmecenin üçüncü kolonu sohbet rayıdır;
    // `channel-sidebar` yalnız `/channels/[serverId]/*` altında çizilir (bkz. `app-shell.spec`).
    await expect(drawer.getByTestId("messages-rail").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("mobile shell exposes one primary navigation control per route", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await useMobileViewport(page, defaultMobileViewport);
    await loginAs(page, "alice");

    await gotoAppRoute(page, "/messages", {
      readyTestId: "mobile-workspace-drawer-button",
    });
    await expect(
      page.locator('[data-testid="mobile-workspace-drawer-button"]:visible'),
    ).toHaveCount(1);
    await expect(page.locator('[data-testid="mobile-shell-back-button"]:visible')).toHaveCount(0);

    await gotoTextChannelRoute(page, serverId, textChannelId);
    await expect(page.locator('[data-testid="mobile-shell-back-button"]:visible')).toHaveCount(1);
    await expect(
      page.locator('[data-testid="mobile-workspace-drawer-button"]:visible'),
    ).toHaveCount(0);
  });

  test("channel back control opens the mobile channel drawer", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await useMobileViewport(page, defaultMobileViewport);
    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);

    await page.getByTestId("mobile-shell-back-button").click();

    const drawer = page.getByTestId("mobile-workspace-drawer");
    await expectMobileSurfaceHealthy(page, drawer);
    await expect(drawer.getByTestId("channel-sidebar").first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("mobile chat composer can send messages without layout overflow", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const content = `Mobile composer message ${Date.now()}`;

    await useMobileViewport(page, defaultMobileViewport);
    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);

    await expectMobileSurfaceHealthy(page, visibleTestId(page, "message-composer"));
    await expectComposerInputBudget(page, `Mobile input budget ${Date.now()}`);
    await sendMessage(page, content);
    await expect(messageByText(page, content)).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalOverflow(page);
  });

  test("mobile message actions use the compact menu and reaction sheet", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();
    const content = `Mobile actions target ${Date.now()}`;
    const emoji = "\u{1F44D}";

    await useMobileViewport(page, defaultMobileViewport);
    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);
    await sendMessage(page, content);

    const message = messageByText(page, content);
    await expect(message).toBeVisible({ timeout: 10_000 });
    await message.getByTestId("message-mobile-actions").click();

    /*
     * Çubuk gövdeye portallanıyor: transform'lu sanal satırın içinde kalsaydı
     * `fixed` ekranın altına değil satırın altına oturuyordu. Bu yüzden çubuk
     * satırın **içinde** değil, sayfada mesaj kimliğiyle aranıyor.
     */
    const messageId = await message.getAttribute("data-message-id");
    const toolbar = page.locator(
      `[data-testid="message-toolbar"][data-message-id="${messageId}"]:visible`,
    );
    await expect(toolbar).toBeVisible();
    const reactButton = toolbar.getByTestId("message-action-react");
    await reactButton.focus();
    await expect(reactButton).toBeFocused();
    await page.keyboard.press("Enter");

    const reactionPicker = page.getByTestId("reaction-picker");
    await expectMobileSurfaceHealthy(page, reactionPicker);
    await page.getByTestId("reaction-option").filter({ hasText: emoji }).click();
    await expect(
      message.getByTestId("message-reaction").filter({ hasText: `${emoji} 1` }),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("mobile message list scroll remains stable", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await useMobileViewport(page, defaultMobileViewport, {
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);

    const messageList = visibleTestId(page, "message-list");
    await expect(messageList).toBeVisible();
    await messageList.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expectNoHorizontalOverflow(page);
    await messageList.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expectNoHorizontalOverflow(page);
  });

  test("mobile settings navigation stays inside the viewport", async ({ page }) => {
    await useMobileViewport(page, { height: 800, width: 360 });
    await loginAs(page, "alice");
    /*
     * K2: `settings-panel.tsx` (ve `settings-mobile-*` iskelesi) silindi; Ayarlar artık bir
     * rota ve tek bir pencere bileşeni çiziyor. `?section=&panel=` sorgusu yol segmentine
     * göç etti — `/settings` bugün 308 ile `/settings/account/profile`'a gider.
     *
     * Dar ekranın karşılığı ayrı bir ekran değil, aynı pencerenin kırılımı: `<=860px`'te
     * gezinme kolonu yatay şeride döner (`globals.css`, `.settings-window-nav`). Test bu
     * yüzden şeridi ölçüyor; sorduğu şey değişmedi: bölüm değiştirmek görünüm alanının
     * dışına taşmıyor mu.
     */
    await gotoAppRoute(page, "/settings", { readyTestId: "settings-window" });
    await expect(page).toHaveURL(/\/settings\/account\/profile$/);
    await expect(page.getByTestId("settings-skeleton")).toHaveCount(0);

    const settingsNav = page.getByTestId("settings-nav");

    await expectMobileSurfaceHealthy(page, settingsNav);
    await expectNoHorizontalOverflow(page);

    await settingsNav.locator('[data-section="appearance"]').click();
    await expect(page).toHaveURL(/\/settings\/appearance\//);
    await expectMobileSurfaceHealthy(page, settingsNav);
    await expectNoHorizontalOverflow(page);

    await settingsNav.locator('[data-section="notifications"]').click();
    await expect(page).toHaveURL(/\/settings\/notifications\//);
    await expectMobileSurfaceHealthy(page, settingsNav);
    await expectNoHorizontalOverflow(page);
  });

  // Faz 2: bildirim zili kullanıcı ayağından kaldırıldı (SPEC §2.5 üç buton). Zilin tasarımdaki
  // yeri ana alan üst çubuğu; Faz 4 onu yazınca bu iki test aynen geri açılacak.
  test.skip("mobile notification popup fits the viewport", async ({ page }) => {
    await useMobileViewport(page, defaultMobileViewport);
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/messages", {
      readyTestId: "mobile-workspace-drawer-button",
    });

    await page.getByTestId("mobile-workspace-drawer-button").click();
    await page
      .getByTestId("mobile-workspace-drawer")
      .getByTestId("notification-bell-button")
      .click();

    const popup = visibleTestId(page, "notification-panel");
    await expectMobileSurfaceHealthy(page, popup);
    await expectVisibleTestIdCountAtMost(page, "notification-panel", 1);
    await expectNoHorizontalOverflow(page);
  });

  test.skip("mobile userbar popups are exclusive and fit the viewport", async ({ page }) => {
    await useMobileViewport(page, defaultMobileViewport);
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/messages", {
      readyTestId: "mobile-workspace-drawer-button",
    });

    await page.getByTestId("mobile-workspace-drawer-button").click();
    const drawer = page.getByTestId("mobile-workspace-drawer");
    await expect(drawer).toBeVisible();

    await drawer.getByTestId("user-settings-button").click();
    const quickMenu = visibleTestId(page, "user-quick-menu");
    await expectMobileSurfaceHealthy(page, quickMenu);
    await expectVisibleTestIdCountAtMost(page, "user-quick-menu", 1);

    await drawer.getByTestId("notification-bell-button").click();
    await expect(quickMenu).toHaveCount(0);

    const notificationPopup = visibleTestId(page, "notification-panel");
    await expectMobileSurfaceHealthy(page, notificationPopup);
    await expectVisibleTestIdCountAtMost(page, "notification-panel", 1);
    await expectVisibleTestIdCountAtMost(page, "user-quick-menu", 0);
  });
});
