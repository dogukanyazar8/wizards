import { test, expect } from "../../fixtures/test";
import { resolveE2ETimeoutPolicy } from "@/lib/e2e/timeout-policy";
import { loginAs } from "../../helpers/auth";
import { getE2EServerRoute } from "../../helpers/db";
import {
  gotoAppRoute,
  gotoTextChannelRoute,
  openSettingsFromUserQuickMenu,
} from "../../helpers/navigation";
import { resetAndSeedE2EData } from "../../setup/e2e-database";

test.use({ locale: "en-US", timezoneId: "UTC" });

test.describe.configure({ timeout: resolveE2ETimeoutPolicy().screenTestTimeoutMs });

test.describe("visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await resetAndSeedE2EData();
    await page.addInitScript(() => {
      window.localStorage.setItem("wizards.locale", "en");
      window.localStorage.setItem("wizards-theme", "theme-dark");
      document.cookie = "wizards.locale=en; path=/; max-age=31536000; samesite=lax";
      document.documentElement.lang = "en";
      document.documentElement.classList.remove("theme-light", "theme-dark");
      document.documentElement.classList.add("theme-dark");
      document.documentElement.dataset.theme = "dark";
      document.documentElement.style.colorScheme = "dark";
    });
  });

  test("login screen", async ({ page }) => {
    await gotoAppRoute(page, "/login", { readyTestId: "login-form" });

    await expect(page).toHaveScreenshot("login.png");
  });

  test("DM home shell", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/channels/@me", { readyTestId: "server-rail" });

    await expect(page).toHaveScreenshot("dm-home.png");
  });

  test("server text channel", async ({ page }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);

    await expect(page).toHaveScreenshot("server-text-channel.png");
  });

  test("settings overlay", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/channels/@me", { readyTestId: "user-bar" });
    await openSettingsFromUserQuickMenu(page);
    await expect(
      page.locator('[data-testid="settings-panel"][data-client-ready="true"]'),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page).toHaveScreenshot("settings-overlay.png");
  });
});
