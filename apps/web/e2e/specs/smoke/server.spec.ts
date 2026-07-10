import { test, expect } from "../../fixtures/test";
import { apiLoginAs } from "../../helpers/api-auth";
import { loginAs } from "../../helpers/auth";
import {
  addE2EServerMember,
  createIsolatedServerForMembershipTest,
  deleteIsolatedE2EServer,
} from "../../helpers/db";
import { gotoAppRoute } from "../../helpers/navigation";

test.describe("server smoke", () => {
  test("user can create and open a server", async ({ page }) => {
    const serverName = `Whispr Smoke ${Date.now()}`;

    await loginAs(page, "alice");
    await gotoAppRoute(page, "/channels/@me", { readyTestId: "create-server-button" });
    await page.getByTestId("create-server-button").click();

    await expect(page.getByTestId("server-create-form")).toBeVisible();
    await page.getByTestId("server-name-input").fill(serverName);
    await page.getByTestId("server-short-name-input").fill("SMK1");
    await page
      .getByTestId("server-description-input")
      .fill("Created by the Playwright smoke suite.");
    await page.getByTestId("server-submit-button").click();

    await expect(page).toHaveURL(/\/channels\/[0-9a-f-]+\/[0-9a-f-]+/i);
    const channelSidebar = page.getByTestId("channel-sidebar");
    await expect(channelSidebar).toContainText(serverName);
    await expect(channelSidebar).toContainText("welcome-chat");
    await expect(channelSidebar).toContainText("live-room");
  });

  test("server creation rejects empty and overlong names", async ({ page, request }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/channels/@me", { readyTestId: "create-server-button" });
    await page.getByTestId("create-server-button").click();

    await expect(page.getByTestId("server-create-form")).toBeVisible();
    await expect(page.getByTestId("server-submit-button")).toBeDisabled();
    await page.getByTestId("server-name-input").fill("A");
    await expect(page.getByText(/At least 2 characters|En az 2 karakter/i)).toBeVisible();
    await expect(page.getByTestId("server-submit-button")).toBeDisabled();

    await apiLoginAs(request, "alice");
    const response = await request.post("/api/v1/servers", {
      data: {
        name: "x".repeat(65),
        shortName: "LONG",
      },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  });

  test("non-owners cannot delete another user's server", async ({ request }) => {
    const { serverId } = await createIsolatedServerForMembershipTest("alice");

    try {
      await addE2EServerMember(serverId, "bob");
      await apiLoginAs(request, "bob");
      const response = await request.delete(`/api/v1/servers/${serverId}`, {
        data: {
          confirmationName: "Whispr E2E Membership",
        },
      });

      expect(response.status()).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: "FORBIDDEN",
      });
    } finally {
      await deleteIsolatedE2EServer(serverId);
    }
  });
});
