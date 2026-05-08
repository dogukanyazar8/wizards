import type { Browser, BrowserContext, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  clearE2EVoiceStates,
  expectVoiceParticipantCount,
  getE2EServerRoute,
} from "../../helpers/db";
import { e2eUsers, type E2EUserKey } from "../../helpers/test-data";

const E2E_MICROPHONE_DENIED_KEY = "whispr:e2e:deny-microphone";
const E2E_CAMERA_DENIED_KEY = "whispr:e2e:deny-camera";
const E2E_SCREEN_SHARE_DENIED_KEY = "whispr:e2e:deny-screen-share";

type LoggedInPage = {
  context: BrowserContext;
  page: Page;
};

async function openLoggedInPage(browser: Browser, userKey: E2EUserKey): Promise<LoggedInPage> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await loginAs(page, userKey);

  return { context, page };
}

async function closeLoggedInPages(pages: LoggedInPage[]): Promise<void> {
  await Promise.all(pages.map(({ context }) => context.close()));
}

async function openVoiceChannel(page: Page): Promise<{
  serverId: string;
  textChannelId: string;
  voiceChannelId: string;
}> {
  const route = await getE2EServerRoute();
  await page.goto(`/channels/${route.serverId}/${route.voiceChannelId}`);
  await expect(page.getByTestId("voice-channel-view")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("voice-room-control-disconnect")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("voice-room-control-camera")).toBeVisible({
    timeout: 10_000,
  });
  return route;
}

async function sendMessage(page: Page, content: string): Promise<void> {
  await page.getByTestId("message-input").fill(content);
  await page.getByTestId("message-send-button").click();
}

async function setRangeValue(page: Page, testId: string, value: number): Promise<void> {
  await page.getByTestId(testId).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;

    valueSetter?.call(input, String(nextValue));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
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

  test("another server member sees voice join and leave without reload", async ({ browser }) => {
    const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();
    const alice = await openLoggedInPage(browser, "alice");
    const bob = await openLoggedInPage(browser, "bob");

    try {
      await bob.page.goto(`/channels/${serverId}/${textChannelId}`);
      await alice.page.goto(`/channels/${serverId}/${voiceChannelId}`);

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

  test("closing the browser tab cleans the voice state", async ({ browser }) => {
    const alice = await openLoggedInPage(browser, "alice");
    const { voiceChannelId } = await openVoiceChannel(alice.page);

    await expectVoiceParticipantCount(voiceChannelId, 1);
    await alice.page.close({ runBeforeUnload: true });
    await expectVoiceParticipantCount(voiceChannelId, 0);
    await alice.context.close();
  });

  test("opening settings does not disconnect the active voice session", async ({ page }) => {
    const { serverId, voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);
    await page.getByTestId("user-settings-button").click();
    await expect(page).toHaveURL(/\/settings/);
    await expectVoiceParticipantCount(voiceChannelId, 1);

    await page.goto(`/channels/${serverId}/${voiceChannelId}`);
    await expect(page.getByTestId("voice-room-control-disconnect")).toBeVisible({
      timeout: 10_000,
    });
    await expectVoiceParticipantCount(voiceChannelId, 1);
  });

  test("saving settings and sending messages keeps voice connected", async ({ page }) => {
    const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();
    const message = `Voice stays live while chatting ${Date.now()}`;

    await loginAs(page, "alice");
    await openVoiceChannel(page);
    await page.goto("/settings?section=notifications&panel=general");
    await expect(page.getByTestId("settings-panel")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("active-voice-reminder")).toBeVisible();
    await page.getByTestId("active-voice-reminder-return").click();
    await expect(page).toHaveURL(new RegExp(`/channels/${serverId}/${voiceChannelId}$`));
    await expect(page.getByTestId("active-voice-reminder")).toBeHidden();
    await page.goto("/settings?section=notifications&panel=general");
    await expect(page.getByTestId("settings-panel")).toBeVisible({ timeout: 10_000 });

    await setRangeValue(page, "settings-notification-limit", 6);
    await expectVoiceParticipantCount(voiceChannelId, 1);

    await page.goto(`/channels/${serverId}/${textChannelId}`);
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
    await expect(page.getByTestId("voice-stage-primary-screen")).toBeVisible();
    await page.getByTestId("voice-stage-focus-camera").click();
    await expect(page.getByTestId("voice-stage-primary-camera")).toBeVisible();
    await page.getByTestId("voice-stage-focus-screen").click();
    await expect(page.getByTestId("voice-stage-primary-screen")).toBeVisible();
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
    await expectElementWithinViewport(page, "voice-screen-share-stage");

    await page.getByTestId("voice-stage-focus-camera").click();
    await expect(page.getByTestId("voice-stage-primary-camera")).toBeVisible();
    await expect(page.getByTestId("voice-stage-screen-pip")).toBeVisible();
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

    await page.goto(`/channels/${serverId}/${textChannelId}`);
    await expect(page.getByTestId("message-input")).toBeVisible({ timeout: 10_000 });
    await expectVoiceParticipantCount(voiceChannelId, 1);

    await page.goto("/channels/@me");
    await page.getByTestId(`server-rail-server-${serverId}`).click();

    await expect(page).toHaveURL(new RegExp(`/channels/${serverId}/${voiceChannelId}$`));
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

    await page.goto("/channels/@me");
    await page.getByTestId(`server-rail-server-${serverId}`).click();

    await expect(page).toHaveURL(new RegExp(`/channels/${serverId}/${textChannelId}$`));
    await expect(page.getByTestId("message-input")).toBeVisible({ timeout: 10_000 });
    await expectVoiceParticipantCount(voiceChannelId, 0);
  });

  test("returning to a server restores the last text channel without an active voice session", async ({
    page,
  }) => {
    const { serverId, textChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await page.goto(`/channels/${serverId}/${textChannelId}`);
    await expect(page.getByTestId("message-input")).toBeVisible({ timeout: 10_000 });

    await page.goto("/channels/@me");
    await page.getByTestId(`server-rail-server-${serverId}`).click();

    await expect(page).toHaveURL(new RegExp(`/channels/${serverId}/${textChannelId}$`));
    await expect(page.getByTestId("message-input")).toBeVisible({ timeout: 10_000 });
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

  test("mixed camera states stay contained with multiple participants", async ({ browser }) => {
    const alice = await openLoggedInPage(browser, "alice");
    const bob = await openLoggedInPage(browser, "bob");
    const charlie = await openLoggedInPage(browser, "charlie");

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

  test("screen share state appears in the sidebar for other members", async ({ browser }) => {
    const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();
    const alice = await openLoggedInPage(browser, "alice");
    const bob = await openLoggedInPage(browser, "bob");

    try {
      await bob.page.goto(`/channels/${serverId}/${textChannelId}`);
      await alice.page.goto(`/channels/${serverId}/${voiceChannelId}`);
      await alice.page.getByTestId("voice-room-control-screen-share").click();

      await expect(
        bob.page.getByTestId(`voice-sidebar-screen-share-${e2eUsers.alice.username}`),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await closeLoggedInPages([alice, bob]);
    }
  });

  test("permission denied states are graceful", async ({ page }) => {
    const { serverId, voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await page.evaluate(
      ({ microphoneKey, screenShareKey }) => {
        window.localStorage.setItem(microphoneKey, "true");
        window.localStorage.setItem(screenShareKey, "true");
      },
      {
        microphoneKey: E2E_MICROPHONE_DENIED_KEY,
        screenShareKey: E2E_SCREEN_SHARE_DENIED_KEY,
      },
    );

    await page.goto(`/channels/${serverId}/${voiceChannelId}`);

    const errorState = page.getByTestId("voice-error-state");

    await expect(errorState).toBeVisible({
      timeout: 10_000,
    });
    await expect(errorState).toContainText(/microphone|mikrofon|blocked|engellendi/i);
    await expect(page.getByTestId("voice-room-control-mute")).toHaveAttribute(
      "data-active",
      "true",
    );

    await page.getByTestId("voice-room-control-screen-share").click();
    await expect(page.getByTestId("voice-room-control-screen-share")).toHaveAttribute(
      "data-active",
      "false",
    );
    await expect(errorState).toBeVisible();
  });
});
