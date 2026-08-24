import { test, expect } from "../../fixtures/test";
import { apiLoginAs, e2eRequestHeaders } from "../../helpers/api-auth";
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
    await gotoAppRoute(page, "/messages", { readyTestId: "create-server-button" });
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
    await gotoAppRoute(page, "/messages", { readyTestId: "create-server-button" });
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
      headers: e2eRequestHeaders,
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
        headers: e2eRequestHeaders,
      });

      expect(response.status()).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "Only the server owner can perform this action",
      });
    } finally {
      await deleteIsolatedE2EServer(serverId);
    }
  });

  test("channel advanced settings persist across create, edit, and refresh", async ({ page }) => {
    const { serverId, textChannelId } = await createIsolatedServerForMembershipTest("alice");
    const voiceName = `advanced-voice-${Date.now().toString(36)}`;
    const textName = `advanced-text-${Date.now().toString(36)}`;

    try {
      await loginAs(page, "alice");
      await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
        readyTestId: "channel-sidebar",
      });

      await page.getByTestId("create-voice-channel-button").click();
      const voiceForm = page.getByTestId("channel-form");
      await voiceForm.locator("#channel-name").fill(voiceName);
      await voiceForm.getByTestId("channel-advanced-settings").locator("summary").click();
      await voiceForm.locator("#channel-bitrate").selectOption("96000");
      await voiceForm.locator("#channel-user-limit").fill("3");
      await voiceForm.locator("#channel-video-quality").selectOption("FULL");
      await voiceForm.getByTestId("channel-submit-button").click();
      await expect(page.getByText(voiceName, { exact: true })).toBeVisible();

      await page.getByTestId("create-text-channel-button").click();
      const textForm = page.getByTestId("channel-form");
      await textForm.locator("#channel-name").fill(textName);
      await textForm.getByTestId("channel-advanced-settings").locator("summary").click();
      await textForm.locator("#channel-slow-mode").selectOption("30");
      await textForm.getByTestId("channel-submit-button").click();
      await expect(page.getByText(textName, { exact: true })).toBeVisible();

      await page.reload();
      await expect(page.getByTestId("channel-sidebar")).toBeVisible();
      await page.getByText(voiceName, { exact: true }).hover();
      await page.locator(`button[data-channel-edit-name="${voiceName}"]`).click();

      const editForm = page.getByTestId("channel-form");
      await editForm.getByTestId("channel-advanced-settings").locator("summary").click();
      await expect(editForm.locator("#channel-bitrate")).toHaveValue("96000");
      await expect(editForm.locator("#channel-user-limit")).toHaveValue("3");
      await expect(editForm.locator("#channel-rtc-region")).toHaveValue("");
      await expect(editForm.locator("#channel-video-quality")).toHaveValue("FULL");

      await editForm.locator("#channel-bitrate").selectOption("128000");
      await editForm.locator("#channel-user-limit").fill("5");
      await editForm.locator("#channel-video-quality").selectOption("AUTO");
      await editForm.getByTestId("channel-submit-button").click();
      await expect(editForm).toBeHidden();

      await page.reload();
      await expect(page.getByTestId("channel-sidebar")).toBeVisible();
      await page.getByText(voiceName, { exact: true }).hover();
      await page.locator(`button[data-channel-edit-name="${voiceName}"]`).click();
      const refreshedForm = page.getByTestId("channel-form");
      await refreshedForm.getByTestId("channel-advanced-settings").locator("summary").click();
      await expect(refreshedForm.locator("#channel-bitrate")).toHaveValue("128000");
      await expect(refreshedForm.locator("#channel-user-limit")).toHaveValue("5");
      await expect(refreshedForm.locator("#channel-video-quality")).toHaveValue("AUTO");
    } finally {
      await deleteIsolatedE2EServer(serverId);
    }
  });
});
