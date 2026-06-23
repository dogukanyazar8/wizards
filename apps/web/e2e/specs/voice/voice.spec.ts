import type { Browser, BrowserContext, Page, TestInfo } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  attachE2EPageDiagnostics,
  type E2EPageDiagnosticsHandle,
} from "../../helpers/diagnostics";
import {
  clearE2EVoiceStates,
  expectVoiceParticipantCountAtLeast,
  expectVoiceParticipantCount,
  getE2EServerRoute,
} from "../../helpers/db";
import { sendComposerMessage } from "../../helpers/messages";
import {
  clickChannelSidebarChannelAndWait,
  clickServerRailDmAndWait,
  clickServerRailServerAndWait,
  closeInAppSettingsOverlay,
  gotoAppRoute,
  gotoTextChannelRoute,
  openSettingsFromUserQuickMenu,
} from "../../helpers/navigation";
import { e2eUsers, type E2EUserKey } from "../../helpers/test-data";

const E2E_MICROPHONE_DENIED_KEY = "whispr:e2e:deny-microphone";
const E2E_CAMERA_DENIED_KEY = "whispr:e2e:deny-camera";
const E2E_SCREEN_SHARE_DENIED_KEY = "whispr:e2e:deny-screen-share";

type LoggedInPage = {
  context: BrowserContext;
  diagnostics: E2EPageDiagnosticsHandle;
  page: Page;
};

type E2EServerRoute = Awaited<ReturnType<typeof getE2EServerRoute>>;

async function openLoggedInPage(
  browser: Browser,
  userKey: E2EUserKey,
  testInfo: TestInfo,
): Promise<LoggedInPage> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const diagnostics = attachE2EPageDiagnostics(page, testInfo, userKey);

  await loginAs(page, userKey);

  return { context, diagnostics, page };
}

async function closeLoggedInPages(pages: LoggedInPage[]): Promise<void> {
  await Promise.allSettled(pages.map(({ diagnostics }) => diagnostics.attachIfFailed()));
  await Promise.allSettled(pages.map(({ context }) => context.close()));
  for (const { diagnostics } of pages) {
    diagnostics.dispose();
  }
}

async function openVoiceChannelRoute(page: Page, route: E2EServerRoute): Promise<void> {
  await gotoAppRoute(page, `/channels/${route.serverId}/${route.voiceChannelId}`, {
    readyTestId: "voice-channel-view",
  });
  await expect(page.getByTestId("voice-channel-view")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("voice-room-control-disconnect")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("voice-room-control-camera")).toBeVisible({
    timeout: 10_000,
  });
  await expectVoiceParticipantCountAtLeast(route.voiceChannelId, 1);
}

async function openVoiceChannel(page: Page): Promise<E2EServerRoute> {
  const route = await getE2EServerRoute();
  await openVoiceChannelRoute(page, route);
  return route;
}

async function sendMessage(page: Page, content: string): Promise<void> {
  await sendComposerMessage(page, content);
}

function voiceSidebarParticipant(page: Page, username: string) {
  return page.getByTestId(`voice-sidebar-participant-${username}`);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      { timeout: 10_000 },
    )
    .toBeLessThanOrEqual(2);
}

async function expectElementWithinViewport(page: Page, testId: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.getByTestId(testId).evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return Math.ceil(
            Math.max(
              0,
              -rect.left,
              -rect.top,
              rect.right - window.innerWidth,
              rect.bottom - window.innerHeight,
            ),
          );
        }),
      { timeout: 10_000 },
    )
    .toBeLessThanOrEqual(2);
}

test.describe("voice and screen share", () => {
  test.beforeEach(async () => {
    await clearE2EVoiceStates();
  });

  test("user can join voice, mute, deafen, and leave", async ({ page }) => {
    const { voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);

    await expect(page.getByTestId("voice-participant-card")).toContainText(e2eUsers.alice.username);
    await expect(voiceSidebarParticipant(page, e2eUsers.alice.username)).toBeVisible({
      timeout: 10_000,
    });
    await expectVoiceParticipantCount(voiceChannelId, 1);

    await page.getByTestId("voice-room-control-mute").click();
    await expect(page.getByTestId("voice-room-control-mute")).toHaveAttribute(
      "data-active",
      "true",
    );

    await page.getByTestId("voice-room-control-mute").click();
    await expect(page.getByTestId("voice-room-control-mute")).toHaveAttribute(
      "data-active",
      "false",
    );

    await page.getByTestId("voice-room-control-deafen").click();
    await expect(page.getByTestId("voice-room-control-deafen")).toHaveAttribute(
      "data-active",
      "true",
    );

    await page.getByTestId("voice-room-control-camera").click();
    await expect(page.getByTestId("voice-room-control-camera")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();

    await page.getByTestId("voice-room-control-camera").click();
    await expect(page.getByTestId("voice-room-control-camera")).toHaveAttribute(
      "data-active",
      "false",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeHidden();

    await page.getByTestId("voice-room-control-disconnect").click();
    await expect(page.getByTestId("voice-participant-card")).toBeHidden({
      timeout: 10_000,
    });
    await expectVoiceParticipantCount(voiceChannelId, 0);
  });

  test("camera state is cleared after leaving and rejoining voice", async ({ page }) => {
    const { voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);

    await page.getByTestId("voice-room-control-camera").click();
    await expect(page.getByTestId("voice-room-control-camera")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();

    await page.getByTestId("voice-room-control-disconnect").click();
    await expect(page.getByTestId("voice-participant-card")).toBeHidden({
      timeout: 10_000,
    });
    await expect(page.getByTestId("voice-participant-camera-video")).toBeHidden();
    await expectVoiceParticipantCount(voiceChannelId, 0);

    await openVoiceChannel(page);
    await expect(page.getByTestId("voice-room-control-camera")).toHaveAttribute(
      "data-active",
      "false",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeHidden();
    await expectVoiceParticipantCount(voiceChannelId, 1);
  });

  test("another server member sees voice join and leave without reload", async (
    { browser },
    testInfo,
  ) => {
    const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();
    const alice = await openLoggedInPage(browser, "alice", testInfo);
    const bob = await openLoggedInPage(browser, "bob", testInfo);

    try {
      await gotoTextChannelRoute(bob.page, serverId, textChannelId);
      await openVoiceChannelRoute(alice.page, { serverId, textChannelId, voiceChannelId });

      await expect(voiceSidebarParticipant(bob.page, e2eUsers.alice.username)).toBeVisible({
        timeout: 10_000,
      });

      await alice.page.getByTestId("voice-room-control-disconnect").click();
      await expect(voiceSidebarParticipant(bob.page, e2eUsers.alice.username)).toBeHidden({
        timeout: 10_000,
      });
    } finally {
      await closeLoggedInPages([alice, bob]);
    }
  });

  test("closing the browser tab cleans the voice state", async ({ browser }, testInfo) => {
    const alice = await openLoggedInPage(browser, "alice", testInfo);

    try {
      const { voiceChannelId } = await openVoiceChannel(alice.page);

      await expectVoiceParticipantCount(voiceChannelId, 1);
      await alice.page.close({ runBeforeUnload: true });
      await expectVoiceParticipantCount(voiceChannelId, 0);
    } finally {
      await alice.diagnostics.attachIfFailed();
      await alice.context.close();
      alice.diagnostics.dispose();
    }
  });

  test("opening settings does not disconnect the active voice session", async ({ page }) => {
    const { serverId, voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);
    await openSettingsFromUserQuickMenu(page);
    await expectVoiceParticipantCount(voiceChannelId, 1);

    await closeInAppSettingsOverlay(page);
    await expect(page.getByTestId("voice-room-control-disconnect")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(new RegExp(`/channels/${serverId}/${voiceChannelId}$`));
    await expectVoiceParticipantCount(voiceChannelId, 1);
  });

  test("opening settings and sending messages keeps voice connected", async ({ page }) => {
    const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();
    const message = `Voice stays live while chatting ${Date.now()}`;

    await loginAs(page, "alice");
    await openVoiceChannel(page);
    await openSettingsFromUserQuickMenu(page);
    await expect(page.getByTestId("settings-panel")).toBeVisible({ timeout: 10_000 });
    await expectVoiceParticipantCount(voiceChannelId, 1);

    await closeInAppSettingsOverlay(page);
    await clickChannelSidebarChannelAndWait(
      page,
      textChannelId,
      new RegExp(`/channels/${serverId}/${textChannelId}$`),
      { readyTestId: "message-input", waitForMessages: true },
    );
    await sendMessage(page, message);

    await expect(page.getByTestId("message-item").filter({ hasText: message })).toBeVisible();
    await expectVoiceParticipantCount(voiceChannelId, 1);
  });

  test("voice settings clean profile applies without disconnecting", async ({ page }) => {
    const { voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);
    await page.getByTestId("voice-room-control-settings").click();

    await expect(page.getByTestId("voice-settings-modal")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("voice-clean-voice-status")).toBeVisible();
    await page.getByTestId("voice-clean-voice-profile").click();

    await expect(page.getByTestId("voice-room-control-disconnect")).toBeVisible();
    await expect(page.getByTestId("voice-settings-modal")).toBeVisible();
    await expectVoiceParticipantCount(voiceChannelId, 1);
  });

  test("screen share can be started and quality options render", async ({ page }) => {
    await loginAs(page, "alice");
    await openVoiceChannel(page);

    await page.getByTestId("voice-room-control-screen-share").click();
    await expect(page.getByTestId("voice-room-control-screen-share")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByTestId("voice-screen-share-stage")).toBeVisible({
      timeout: 10_000,
    });
    await expectElementWithinViewport(page, "voice-screen-share-stage");
    await expect(page.getByTestId("screen-share-quality-select")).toBeVisible();
    await expect(page.getByTestId("screen-share-quality-select").locator("option")).toHaveCount(3);

    await page.getByTestId("screen-share-quality-select").selectOption("h1440fps60");
    await expect(page.getByTestId("screen-share-quality-select")).toHaveValue("h1440fps60");
    await expect(page.getByTestId("voice-screen-share-stage")).toBeVisible();
  });

  test("screen share does not break microphone controls", async ({ page }) => {
    const { voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);
    await page.getByTestId("voice-room-control-screen-share").click();

    await expect(page.getByTestId("voice-room-control-screen-share")).toHaveAttribute(
      "data-active",
      "true",
    );
    await page.getByTestId("voice-room-control-camera").click();
    await expect(page.getByTestId("voice-room-control-camera")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();
    await expect(page.getByTestId("voice-stage-camera-pip")).toBeVisible();
    await expect(page.getByTestId("voice-screen-share-stage")).toBeVisible();
    await expectElementWithinViewport(page, "voice-screen-share-stage");
    await page.getByTestId("voice-room-control-mute").click();
    await expect(page.getByTestId("voice-room-control-mute")).toHaveAttribute(
      "data-active",
      "true",
    );
    await page.getByTestId("voice-room-control-mute").click();
    await expect(page.getByTestId("voice-room-control-mute")).toHaveAttribute(
      "data-active",
      "false",
    );
    await expect(page.getByTestId("voice-room-control-screen-share")).toHaveAttribute(
      "data-active",
      "true",
    );
    await page.getByTestId("voice-room-control-camera").click();
    await expect(page.getByTestId("voice-room-control-camera")).toHaveAttribute(
      "data-active",
      "false",
    );
    await expect(page.getByTestId("voice-room-control-screen-share")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByTestId("voice-screen-share-stage")).toBeVisible();
    await expectVoiceParticipantCount(voiceChannelId, 1);
  });

  test("camera stays visible when screen share starts after video", async ({ page }) => {
    await loginAs(page, "alice");
    await openVoiceChannel(page);

    await page.getByTestId("voice-room-control-camera").click();
    await expect(page.getByTestId("voice-room-control-camera")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();

    await page.getByTestId("voice-room-control-screen-share").click();
    await expect(page.getByTestId("voice-room-control-screen-share")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByTestId("voice-screen-share-stage")).toBeVisible();
    await expect(page.getByTestId("voice-stage-camera-pip")).toBeVisible();
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();
    await expectElementWithinViewport(page, "voice-screen-share-stage");
  });

  test("returning to a server restores active voice without interrupting video or screen share", async ({
    page,
  }) => {
    const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);

    await page.getByTestId("voice-room-control-screen-share").click();
    await expect(page.getByTestId("voice-room-control-screen-share")).toHaveAttribute(
      "data-active",
      "true",
    );

    await page.getByTestId("voice-room-control-camera").click();
    await expect(page.getByTestId("voice-room-control-camera")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();

    await clickChannelSidebarChannelAndWait(
      page,
      textChannelId,
      new RegExp(`/channels/${serverId}/${textChannelId}$`),
      { readyTestId: "message-input", waitForMessages: true },
    );
    await expectVoiceParticipantCount(voiceChannelId, 1);

    await clickServerRailDmAndWait(page, /\/channels\/@me$/, { readyTestId: "server-rail" });
    await clickServerRailServerAndWait(
      page,
      serverId,
      new RegExp(`/channels/${serverId}/${voiceChannelId}$`),
      { readyTestId: "voice-channel-view" },
    );

    await expect(page.getByTestId("voice-channel-view")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("voice-room-control-screen-share")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByTestId("voice-room-control-camera")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByTestId("voice-screen-share-stage")).toBeVisible();
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();
    await expectVoiceParticipantCount(voiceChannelId, 1);
  });

  test("returning to a server after leaving voice opens the first text channel", async ({
    page,
  }) => {
    const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);

    await page.getByTestId("voice-room-control-disconnect").click();
    await expect(page.getByTestId("voice-participant-card")).toBeHidden({
      timeout: 10_000,
    });
    await expectVoiceParticipantCount(voiceChannelId, 0);

    await gotoAppRoute(page, "/channels/@me", { readyTestId: "server-rail" });
    await clickServerRailServerAndWait(
      page,
      serverId,
      new RegExp(`/channels/${serverId}/${textChannelId}$`),
      { readyTestId: "message-input", waitForMessages: true },
    );

    await expectVoiceParticipantCount(voiceChannelId, 0);
  });

  test("returning to a server restores the last text channel without an active voice session", async ({
    page,
  }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await gotoTextChannelRoute(page, serverId, textChannelId);

    await gotoAppRoute(page, "/channels/@me", { readyTestId: "server-rail" });
    await clickServerRailServerAndWait(
      page,
      serverId,
      new RegExp(`/channels/${serverId}/${textChannelId}$`),
      { readyTestId: "message-input", waitForMessages: true },
    );

  });

  test("voice video layout stays contained on desktop and mobile", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, "alice");
    await openVoiceChannel(page);

    await expect(page.getByTestId("voice-participant-card")).toBeVisible();
    await expect(page.getByTestId("voice-room-control-camera")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByTestId("voice-room-control-camera").click();
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("voice-room-control-camera")).toBeVisible();
    await expect(page.getByTestId("voice-room-control-screen-share")).toBeVisible();
    await expect(page.getByTestId("voice-room-control-disconnect")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page
      .getByTestId("voice-participant-card")
      .locator("p")
      .first()
      .evaluate((node) => {
        node.textContent = "Alexandria Cassandra Montgomery Whispr Quality Assurance";
      });
    await expectNoHorizontalOverflow(page);
  });

  test("mixed camera states stay contained with multiple participants", async (
    { browser },
    testInfo,
  ) => {
    const alice = await openLoggedInPage(browser, "alice", testInfo);
    const bob = await openLoggedInPage(browser, "bob", testInfo);
    const charlie = await openLoggedInPage(browser, "charlie", testInfo);

    try {
      await alice.page.setViewportSize({ width: 1280, height: 820 });
      await bob.page.setViewportSize({ width: 1280, height: 820 });
      await charlie.page.setViewportSize({ width: 1280, height: 820 });

      await openVoiceChannel(alice.page);
      await openVoiceChannel(bob.page);
      await openVoiceChannel(charlie.page);

      await alice.page.getByTestId("voice-room-control-camera").click();
      await expect(alice.page.getByTestId("voice-participant-card")).toHaveCount(3, {
        timeout: 10_000,
      });
      await expect(alice.page.getByTestId("voice-participant-camera-video")).toHaveCount(1);
      await expectNoHorizontalOverflow(alice.page);

      await alice.page.setViewportSize({ width: 390, height: 844 });
      await expect(alice.page.getByTestId("voice-participant-card")).toHaveCount(3);
      await expectNoHorizontalOverflow(alice.page);
    } finally {
      await closeLoggedInPages([alice, bob, charlie]);
    }
  });

  test("camera permission denied state is graceful", async ({ page }) => {
    await loginAs(page, "alice");
    await page.evaluate((cameraKey) => {
      window.localStorage.setItem(cameraKey, "true");
    }, E2E_CAMERA_DENIED_KEY);

    await openVoiceChannel(page);
    await page.getByTestId("voice-room-control-camera").click();

    await expect(page.getByTestId("voice-room-control-camera")).toHaveAttribute(
      "data-active",
      "false",
    );
    await expect(page.getByTestId("voice-camera-error")).toBeVisible();
    await expect(page.getByTestId("voice-camera-error")).toContainText(
      /camera|kamera|blocked|engellendi/i,
    );
  });

  test("screen share state appears in the sidebar for other members", async (
    { browser },
    testInfo,
  ) => {
    const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();
    const alice = await openLoggedInPage(browser, "alice", testInfo);
    const bob = await openLoggedInPage(browser, "bob", testInfo);

    try {
      await gotoTextChannelRoute(bob.page, serverId, textChannelId);
      await openVoiceChannelRoute(alice.page, { serverId, textChannelId, voiceChannelId });
      await alice.page.getByTestId("voice-room-control-screen-share").click();

      await expect(
        bob.page.getByTestId(`voice-sidebar-screen-share-${e2eUsers.alice.username}`),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await closeLoggedInPages([alice, bob]);
    }
  });

  test("microphone permission denied state is graceful", async ({ page }) => {
    const { serverId, voiceChannelId } = await getE2EServerRoute();

    await page.addInitScript((microphoneKey) => {
      window.localStorage.setItem(microphoneKey, "true");
    }, E2E_MICROPHONE_DENIED_KEY);
    await loginAs(page, "alice");
    await expect
      .poll(() =>
        page.evaluate(
          (microphoneKey) => window.localStorage.getItem(microphoneKey),
          E2E_MICROPHONE_DENIED_KEY,
        ),
      )
      .toBe("true");

    await gotoAppRoute(page, `/channels/${serverId}/${voiceChannelId}`, {
      readyTestId: "voice-channel-view",
    });

    const errorState = page.getByTestId("voice-inline-error");

    await expect(errorState).toBeVisible({
      timeout: 10_000,
    });
    await expect(errorState).toContainText(/microphone|mikrofon|blocked|engellendi/i);
    await expect(page.getByTestId("voice-room-control-mute")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByTestId("voice-room-control-disconnect")).toBeVisible();
  });

  test("screen share permission denied state is graceful", async ({ page }) => {
    await page.addInitScript((screenShareKey) => {
      window.localStorage.setItem(screenShareKey, "true");
    }, E2E_SCREEN_SHARE_DENIED_KEY);
    await loginAs(page, "alice");
    await expect
      .poll(() =>
        page.evaluate(
          (screenShareKey) => window.localStorage.getItem(screenShareKey),
          E2E_SCREEN_SHARE_DENIED_KEY,
        ),
      )
      .toBe("true");

    await openVoiceChannel(page);
    await page.getByTestId("voice-room-control-screen-share").click();
    await expect(page.getByTestId("voice-room-control-screen-share")).toHaveAttribute(
      "data-active",
      "false",
    );
    await expect(page.getByTestId("voice-inline-error")).toBeVisible();
    await expect(page.getByTestId("voice-inline-error")).toContainText(
      /screen|ekran|permission|blocked|engellendi/i,
    );
    await expect(page.getByTestId("voice-room-control-disconnect")).toBeVisible();
  });
});
