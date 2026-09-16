import type { Browser, BrowserContext, Page, TestInfo } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { attachE2EPageDiagnostics, type E2EPageDiagnosticsHandle } from "../../helpers/diagnostics";
import {
  clearE2EVoiceStates,
  expectVoiceParticipantCountAtLeast,
  expectVoiceParticipantCount,
  getE2EServerRoute,
} from "../../helpers/db";
import { sendComposerMessage } from "../../helpers/messages";
import {
  clickChannelSidebarChannelAndWait,
  clickServerRailServerAndWait,
  closeInAppSettingsOverlay,
  expectSettingsOverlayOpen,
  gotoAppRoute,
  gotoTextChannelRoute,
  openSettingsFromUserQuickMenu,
} from "../../helpers/navigation";
import { e2eUsers, type E2EUserKey } from "../../helpers/test-data";

const E2E_MICROPHONE_DENIED_KEY = "whispr:e2e:deny-microphone";
const E2E_CAMERA_DENIED_KEY = "whispr:e2e:deny-camera";
const E2E_SCREEN_SHARE_DENIED_KEY = "whispr:e2e:deny-screen-share";
const VOICE_READY_TIMEOUT = process.env.CI === "true" ? 30_000 : 15_000;

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
    timeout: VOICE_READY_TIMEOUT,
  });
  await expect(page.getByTestId("voice-channel-view")).toBeVisible({
    timeout: VOICE_READY_TIMEOUT,
  });
  await expect(page.getByTestId("server-voice-control-leave")).toBeVisible({
    timeout: VOICE_READY_TIMEOUT,
  });
  await expect(page.getByTestId("server-voice-control-camera")).toBeVisible({
    timeout: VOICE_READY_TIMEOUT,
  });
  await expect(page.getByTestId("server-voice-control-camera")).toBeEnabled({
    timeout: VOICE_READY_TIMEOUT,
  });
  await expect(page.locator('[data-testid="server-voice-tile"]:visible').first()).toBeVisible({
    timeout: VOICE_READY_TIMEOUT,
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

async function expectVisibleVoiceParticipantCards(page: Page, count: number): Promise<void> {
  await expect(page.locator('[data-testid="server-voice-tile"]:visible')).toHaveCount(count, {
    timeout: VOICE_READY_TIMEOUT,
  });
}

test.describe("voice and screen share", () => {
  test.describe.configure({ timeout: process.env.CI === "true" ? 60_000 : 30_000 });

  test.beforeEach(async () => {
    await clearE2EVoiceStates();
  });

  test("user can join voice, mute, deafen, and leave", async ({ page }) => {
    const { voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);

    // Ş7 kutucuğu görünen adı yazar, `@kullanıcı`yı değil (`server-voice-tile-name`).
    await expect(page.getByTestId("server-voice-tile")).toContainText(e2eUsers.alice.displayName);
    await expect(voiceSidebarParticipant(page, e2eUsers.alice.username)).toBeVisible({
      timeout: 10_000,
    });
    await expectVoiceParticipantCount(voiceChannelId, 1);

    await page.getByTestId("server-voice-control-mic").click();
    await expect(page.getByTestId("server-voice-control-mic")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByTestId("server-voice-control-mic").click();
    await expect(page.getByTestId("server-voice-control-mic")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await page.getByTestId("server-voice-control-speaker").click();
    await expect(page.getByTestId("server-voice-control-speaker")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByTestId("server-voice-control-camera").click();
    await expect(page.getByTestId("server-voice-control-camera")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();

    await page.getByTestId("server-voice-control-camera").click();
    await expect(page.getByTestId("server-voice-control-camera")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeHidden();

    await page.getByTestId("server-voice-control-leave").click();
    await expect(page.getByTestId("server-voice-tile")).toBeHidden({
      timeout: 10_000,
    });
    await expectVoiceParticipantCount(voiceChannelId, 0);
  });

  test("camera state is cleared after leaving and rejoining voice", async ({ page }) => {
    const { voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);

    await page.getByTestId("server-voice-control-camera").click();
    await expect(page.getByTestId("server-voice-control-camera")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();

    await page.getByTestId("server-voice-control-leave").click();
    await expect(page.getByTestId("server-voice-tile")).toBeHidden({
      timeout: 10_000,
    });
    await expect(page.getByTestId("voice-participant-camera-video")).toBeHidden();
    await expectVoiceParticipantCount(voiceChannelId, 0);

    await openVoiceChannel(page);
    await expect(page.getByTestId("server-voice-control-camera")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeHidden();
    await expectVoiceParticipantCount(voiceChannelId, 1);
  });

  test("another server member sees voice join and leave without reload", async ({
    browser,
  }, testInfo) => {
    const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();
    const alice = await openLoggedInPage(browser, "alice", testInfo);
    const bob = await openLoggedInPage(browser, "bob", testInfo);

    try {
      await gotoTextChannelRoute(bob.page, serverId, textChannelId);
      await openVoiceChannelRoute(alice.page, { serverId, textChannelId, voiceChannelId });

      await expect(voiceSidebarParticipant(bob.page, e2eUsers.alice.username)).toBeVisible({
        timeout: 10_000,
      });

      await alice.page.getByTestId("server-voice-control-leave").click();
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
    await expect(page.getByTestId("server-voice-control-leave")).toBeVisible({
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
    await expect(page.getByTestId("settings-window")).toBeVisible({ timeout: 10_000 });
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

  test("voice settings opened from the control bar apply without disconnecting", async ({
    page,
  }) => {
    const { voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);

    // K13: dişli ayrı bir pencere değil, Ayarlar › Ses ve Video › Ses sekmesine giden bir
    // bağlantı (`/settings/av/audio`). Pencere kabuğun üstünde açılır; ses oturumu arkada yaşar.
    await page.getByTestId("server-voice-control-settings").click();
    await expectSettingsOverlayOpen(page);
    await expect(page).toHaveURL(/\/settings\/av\/audio(?:[/?#]|$)/);
    await expect(page.getByTestId("settings-window")).toBeVisible({ timeout: 10_000 });

    // "Temiz ses profili" eylemi üründe yok. Sözleşme aynı: canlı oturumdayken bir işleme
    // ayarı (`p4` Yankı giderme) değiştirilip geri alınır, bağlantı düşmez.
    const echoToggle = page.getByTestId("setting-toggle-p4");
    await expect(echoToggle).toBeVisible();
    const initialChecked = (await echoToggle.getAttribute("aria-checked")) === "true";
    await echoToggle.click();
    await expect(echoToggle).toHaveAttribute("aria-checked", String(!initialChecked));
    await expectVoiceParticipantCount(voiceChannelId, 1);
    await echoToggle.click();
    await expect(echoToggle).toHaveAttribute("aria-checked", String(initialChecked));

    await closeInAppSettingsOverlay(page);
    await expect(page.getByTestId("server-voice-control-leave")).toBeVisible();
    await expectVoiceParticipantCount(voiceChannelId, 1);
  });

  test("screen share can be started and quality options render", async ({ page }) => {
    await loginAs(page, "alice");
    await openVoiceChannel(page);

    await page.getByTestId("server-voice-control-share").click();
    await expect(page.getByTestId("server-voice-control-share")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("server-voice-share-stage")).toBeVisible({
      timeout: 10_000,
    });
    await expectElementWithinViewport(page, "server-voice-share-stage");

    // §5.3: kalite seçici yerel `<select>` değil, `SettingSelect` liste kutusu. Üç ön ayar
    // (`SCREEN_SHARE_QUALITY_OPTIONS`), seçim tetikleyicinin etiketine yazılır.
    const quality = page.getByTestId("server-voice-share-quality");
    await expect(quality).toBeVisible();
    await quality.click();
    const qualityMenu = page.getByTestId("server-voice-share-quality-menu");
    await expect(qualityMenu).toBeVisible();
    await expect(qualityMenu.getByRole("option")).toHaveCount(3);

    await qualityMenu.getByRole("option", { name: /1440p/ }).click();
    await expect(qualityMenu).toBeHidden();
    await expect(quality).toContainText("1440p");
    await expect(page.getByTestId("server-voice-share-stage")).toBeVisible();
  });

  test("screen share does not break microphone controls", async ({ page }) => {
    const { voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);
    await page.getByTestId("server-voice-control-share").click();

    await expect(page.getByTestId("server-voice-control-share")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByTestId("server-voice-control-camera").click();
    await expect(page.getByTestId("server-voice-control-camera")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();
    await expect(page.getByTestId("server-voice-share-camera-pip")).toBeVisible();
    await expect(page.getByTestId("server-voice-share-stage")).toBeVisible();
    await expectElementWithinViewport(page, "server-voice-share-stage");
    await page.getByTestId("server-voice-control-mic").click();
    await expect(page.getByTestId("server-voice-control-mic")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByTestId("server-voice-control-mic").click();
    await expect(page.getByTestId("server-voice-control-mic")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("server-voice-control-share")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByTestId("server-voice-control-camera").click();
    await expect(page.getByTestId("server-voice-control-camera")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("server-voice-control-share")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("server-voice-share-stage")).toBeVisible();
    await expectVoiceParticipantCount(voiceChannelId, 1);
  });

  test("camera stays visible when screen share starts after video", async ({ page }) => {
    await loginAs(page, "alice");
    await openVoiceChannel(page);

    await page.getByTestId("server-voice-control-camera").click();
    await expect(page.getByTestId("server-voice-control-camera")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();

    await page.getByTestId("server-voice-control-share").click();
    await expect(page.getByTestId("server-voice-control-share")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("server-voice-share-stage")).toBeVisible();
    await expect(page.getByTestId("server-voice-share-camera-pip")).toBeVisible();
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();
    await expectElementWithinViewport(page, "server-voice-share-stage");
  });

  test("returning to a server restores active voice without interrupting video or screen share", async ({
    page,
  }) => {
    const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);

    await page.getByTestId("server-voice-control-share").click();
    await expect(page.getByTestId("server-voice-control-share")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByTestId("server-voice-control-camera").click();
    await expect(page.getByTestId("server-voice-control-camera")).toHaveAttribute(
      "aria-pressed",
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

    // Canlı medya oturumu SPA ömrüne bağlıdır. `page.goto` tam sayfa çıkışı üretip
    // gerçek `pagehide` temizliğini çalıştırır; kullanıcı davranışı olan uygulama
    // navigasyonunu kullanarak kesintisiz dönüş sözleşmesini sınarız.
    await page.getByTestId("app-nav-messages").click();
    await expect(page).toHaveURL(/\/messages$/);
    await expect(page.getByTestId("server-rail")).toBeVisible();
    await clickServerRailServerAndWait(
      page,
      serverId,
      new RegExp(`/channels/${serverId}/${voiceChannelId}$`),
      { readyTestId: "voice-channel-view" },
    );

    await expect(page.getByTestId("voice-channel-view")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("server-voice-control-share")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("server-voice-control-camera")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("server-voice-share-stage")).toBeVisible();
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();
    await expectVoiceParticipantCount(voiceChannelId, 1);
  });

  test("returning to a server after leaving voice opens the first text channel", async ({
    page,
  }) => {
    const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();

    await loginAs(page, "alice");
    await openVoiceChannel(page);

    await page.getByTestId("server-voice-control-leave").click();
    await expect(page.getByTestId("server-voice-tile")).toBeHidden({
      timeout: 10_000,
    });
    await expectVoiceParticipantCount(voiceChannelId, 0);

    await gotoAppRoute(page, "/messages", { readyTestId: "server-rail" });
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

    await gotoAppRoute(page, "/messages", { readyTestId: "server-rail" });
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

    await expect(page.getByTestId("server-voice-tile")).toBeVisible();
    const bodyFontFamily = await page
      .locator("body")
      .evaluate((node) => getComputedStyle(node).fontFamily);
    await expect(page.getByTestId("server-voice-tile-name").first()).toHaveCSS(
      "font-family",
      bodyFontFamily,
    );
    await expect(page.getByTestId("server-voice-control-camera")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByTestId("server-voice-control-camera").click();
    await expect(page.getByTestId("voice-participant-camera-video")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("server-voice-control-camera")).toBeVisible();
    await expect(page.getByTestId("server-voice-control-share")).toBeVisible();
    await expect(page.getByTestId("server-voice-control-leave")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page
      .getByTestId("server-voice-tile")
      .getByTestId("server-voice-tile-name")
      .first()
      .evaluate((node) => {
        node.textContent = "Alexandria Cassandra Montgomery Whispr Quality Assurance";
      });
    await expectNoHorizontalOverflow(page);
  });

  test("mixed camera states stay contained with multiple participants", async ({
    browser,
  }, testInfo) => {
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

      await expectVisibleVoiceParticipantCards(alice.page, 3);
      const cameraButton = alice.page.getByTestId("server-voice-control-camera");
      await expect(cameraButton).toBeEnabled({ timeout: VOICE_READY_TIMEOUT });
      await cameraButton.click();
      await expect(cameraButton).toHaveAttribute("aria-pressed", "true", {
        timeout: VOICE_READY_TIMEOUT,
      });
      await expectVisibleVoiceParticipantCards(alice.page, 3);
      await expect(alice.page.getByTestId("voice-participant-camera-video")).toHaveCount(1);
      await expectNoHorizontalOverflow(alice.page);

      await alice.page.setViewportSize({ width: 390, height: 844 });
      await expectVisibleVoiceParticipantCards(alice.page, 3);
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
    await page.getByTestId("server-voice-control-camera").click();

    await expect(page.getByTestId("server-voice-control-camera")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("voice-inline-error")).toBeVisible();
    await expect(page.getByTestId("voice-inline-error")).toContainText(
      /camera|kamera|blocked|engellendi/i,
    );
  });

  test("screen share state appears in the sidebar for other members", async ({
    browser,
  }, testInfo) => {
    const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();
    const alice = await openLoggedInPage(browser, "alice", testInfo);
    const bob = await openLoggedInPage(browser, "bob", testInfo);

    try {
      await gotoTextChannelRoute(bob.page, serverId, textChannelId);
      await openVoiceChannelRoute(alice.page, { serverId, textChannelId, voiceChannelId });
      await alice.page.getByTestId("server-voice-control-share").click();

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
    await expect(page.getByTestId("server-voice-control-mic")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("server-voice-control-leave")).toBeVisible();
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
    await page.getByTestId("server-voice-control-share").click();
    await expect(page.getByTestId("server-voice-control-share")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("voice-inline-error")).toBeVisible();
    await expect(page.getByTestId("voice-inline-error")).toContainText(
      /screen|ekran|permission|blocked|engellendi/i,
    );
    await expect(page.getByTestId("server-voice-control-leave")).toBeVisible();
  });
});
