import type { Page } from "@playwright/test";
import { expect } from "../fixtures/test";

type AppRouteReadyOptions = {
  navigationTimeout?: number;
  readyTestId?: string;
  timeout?: number;
};

type ServerRailNavigationOptions = AppRouteReadyOptions & {
  waitForMessages?: boolean;
};

type ChannelSidebarNavigationOptions = AppRouteReadyOptions & {
  waitForMessages?: boolean;
};

const MESSAGE_LIST_LOADING_TEXT = /Loading messages|Mesajlar yükleniyor/i;
const DEFAULT_APP_READY_TIMEOUT = process.env.CI === "true" ? 30_000 : 15_000;
const INTERRUPTED_NAVIGATION_PATTERN = /Navigation to .* is interrupted by another navigation to /;

function appRouteSegment(value: string): string {
  return encodeURIComponent(value);
}

function cssAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function visibleTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${cssAttributeValue(testId)}"]:visible`).first();
}

export async function waitForMessageListReady(
  page: Page,
  options: Pick<AppRouteReadyOptions, "timeout"> = {},
): Promise<void> {
  const timeout = options.timeout ?? DEFAULT_APP_READY_TIMEOUT;
  const messageList = visibleTestId(page, "message-list");
  const messageInput = visibleTestId(page, "message-input");

  await expect(messageList).toBeVisible({ timeout });
  await expect(messageList.getByText(MESSAGE_LIST_LOADING_TEXT)).toHaveCount(0, { timeout });
  await expect(messageInput).toBeVisible({ timeout });
  await expect(messageInput).toBeEnabled({ timeout });
}

export async function gotoAppRoute(
  page: Page,
  path: string,
  options: AppRouteReadyOptions = {},
): Promise<void> {
  const navigationTimeout = options.navigationTimeout ?? 45_000;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(path, {
        timeout: navigationTimeout,
        waitUntil: "commit",
      });
      break;
    } catch (error) {
      const interruptedByAppRedirect =
        error instanceof Error && INTERRUPTED_NAVIGATION_PATTERN.test(error.message);

      if (attempt > 0 || !interruptedByAppRedirect) {
        throw error;
      }

      try {
        await page.waitForLoadState("domcontentloaded", { timeout: navigationTimeout });
      } catch {
        throw error;
      }
    }
  }

  if (options.readyTestId) {
    await expect(visibleTestId(page, options.readyTestId)).toBeVisible({
      timeout: options.timeout ?? DEFAULT_APP_READY_TIMEOUT,
    });
  }

  if (path.startsWith("/channels")) {
    await expect(visibleTestId(page, "app-startup-screen")).toBeHidden({
      timeout: options.timeout ?? DEFAULT_APP_READY_TIMEOUT,
    });
  }

  if (path === "/channels/@me") {
    await expect(visibleTestId(page, "friends-dashboard")).toHaveAttribute("aria-busy", "false", {
      timeout: options.timeout ?? DEFAULT_APP_READY_TIMEOUT,
    });
  }
}

export async function gotoTextChannelRoute(
  page: Page,
  serverId: string,
  channelId: string,
  options: AppRouteReadyOptions = {},
): Promise<void> {
  await gotoAppRoute(page, `/channels/${appRouteSegment(serverId)}/${appRouteSegment(channelId)}`, {
    ...options,
    readyTestId: options.readyTestId ?? "message-input",
  });
  await waitForMessageListReady(page, options);
}

export async function gotoDmConversationRoute(
  page: Page,
  conversationId: string,
  options: AppRouteReadyOptions = {},
): Promise<void> {
  await gotoAppRoute(page, `/channels/@me/${appRouteSegment(conversationId)}`, {
    ...options,
    readyTestId: options.readyTestId ?? "message-input",
  });
  await waitForMessageListReady(page, options);
}

export async function clickServerRailServerAndWait(
  page: Page,
  serverId: string,
  expectedUrl: string | RegExp,
  options: ServerRailNavigationOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? DEFAULT_APP_READY_TIMEOUT;
  const serverRailItem = visibleTestId(page, `server-rail-server-${serverId}`);

  await expect(serverRailItem).toBeVisible({ timeout });
  await serverRailItem.click();
  await expect(page).toHaveURL(expectedUrl, {
    timeout: options.navigationTimeout ?? timeout,
  });

  if (options.readyTestId) {
    await expect(visibleTestId(page, options.readyTestId)).toBeVisible({ timeout });
  }

  if (options.waitForMessages) {
    await waitForMessageListReady(page, options);
  }
}

export async function clickServerRailDmAndWait(
  page: Page,
  expectedUrl: string | RegExp = /\/channels\/@me(?:$|\/)/,
  options: AppRouteReadyOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? DEFAULT_APP_READY_TIMEOUT;
  const dmItem = visibleTestId(page, "server-rail-dm");

  await expect(dmItem).toBeVisible({ timeout });
  await dmItem.click();
  await expect(page).toHaveURL(expectedUrl, {
    timeout: options.navigationTimeout ?? timeout,
  });

  if (options.readyTestId) {
    await expect(visibleTestId(page, options.readyTestId)).toBeVisible({ timeout });
  }
}

export async function clickChannelSidebarChannelAndWait(
  page: Page,
  channelId: string,
  expectedUrl: string | RegExp,
  options: ChannelSidebarNavigationOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? DEFAULT_APP_READY_TIMEOUT;
  const channelItem = visibleTestId(page, `channel-item-${channelId}`);

  await expect(channelItem).toBeVisible({ timeout });
  await channelItem.click();
  await expect(page).toHaveURL(expectedUrl, {
    timeout: options.navigationTimeout ?? timeout,
  });

  if (options.readyTestId) {
    await expect(visibleTestId(page, options.readyTestId)).toBeVisible({ timeout });
  }

  if (options.waitForMessages) {
    await waitForMessageListReady(page, options);
  }
}

export async function openUserQuickMenu(page: Page): Promise<void> {
  await page.getByTestId("user-settings-button").click();
  await expect(page.getByTestId("user-quick-menu")).toBeVisible();
}

export async function expectSettingsOverlayOpen(page: Page): Promise<void> {
  await expect(page.getByTestId("in-app-settings-overlay")).toBeVisible({
    timeout: 15_000,
  });
}

export async function expectSettingsOverlayClosed(page: Page): Promise<void> {
  await expect(page.getByTestId("in-app-settings-overlay")).toBeHidden({
    timeout: 10_000,
  });
}

export async function openSettingsFromUserQuickMenu(page: Page): Promise<void> {
  await openUserQuickMenu(page);
  await page.getByTestId("user-appearance-settings-button").click();
  await expectSettingsOverlayOpen(page);
}

export async function closeInAppSettingsOverlay(page: Page): Promise<void> {
  await page.getByTestId("in-app-settings-close").click();
  await expectSettingsOverlayClosed(page);
}
