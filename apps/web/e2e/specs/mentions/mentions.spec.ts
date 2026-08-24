import type { Browser, BrowserContext, Page, TestInfo } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  getE2EDMConversationId,
  getE2EServerRoute,
  setE2EUserTheme,
  withE2EDatabase,
} from "../../helpers/db";
import {
  expectNoClippedText,
  expectNoHorizontalOverflow,
  expectNoVerticalOverflow,
} from "../../helpers/design-parity";
import { gotoAppRoute, gotoTextChannelRoute, visibleTestId } from "../../helpers/navigation";
import { e2eUsers, type E2EUserKey } from "../../helpers/test-data";
import { PermissionBits } from "@/lib/workspace/permissions";

test.describe.configure({ mode: "serial", timeout: 90_000 });

const RUN = `${Date.now().toString(36)}-${process.pid}`;
const MARKER = `[mentions-e2e:${RUN}]`;

type CoreFixture = {
  anchorContent: string;
  dmContent: string;
  everyoneContent: string;
  roleContent: string;
  serverId: string;
  textChannelId: string;
  threadContent: string;
};

type LoggedInPage = { context: BrowserContext; page: Page };

let fixture: CoreFixture;
let originalThreadSetting = false;
let originalTheme = "theme-dark";
let originalLocale = "en";
let originalMentionCount = 0;

async function openLoggedInPage(browser: Browser, userKey: E2EUserKey): Promise<LoggedInPage> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, userKey);
  return { context, page };
}

async function openMentions(page: Page, path = "/mentions"): Promise<void> {
  await gotoAppRoute(page, path, { readyTestId: "mentions-feed-header" });
  await expect(visibleTestId(page, "mentions-feed-header")).toBeVisible();
}

function cardWithText(page: Page, text: string) {
  const visibleText = text
    .replace(/(^|\s)@[a-zA-Z0-9_.-]+(?=\s|$)/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return page.getByTestId("mention-card").filter({ hasText: visibleText });
}

async function seedCoreFixture(): Promise<CoreFixture> {
  const { serverId, textChannelId } = await getE2EServerRoute();
  const conversationId = await getE2EDMConversationId();
  const now = Date.now() - 60_000;
  const id = (name: string) => `mentions-e2e-${RUN}-${name}`;
  const at = (offsetMs: number) => new Date(now + offsetMs);

  return withE2EDatabase(async (prisma) => {
    const [alice, bob, charlie, bobMember] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: e2eUsers.alice.email } }),
      prisma.user.findUniqueOrThrow({ where: { email: e2eUsers.bob.email } }),
      prisma.user.findUniqueOrThrow({ where: { email: e2eUsers.charlie.email } }),
      prisma.serverMember.findUniqueOrThrow({
        where: {
          userId_serverId: {
            serverId,
            userId: (
              await prisma.user.findUniqueOrThrow({
                where: { email: e2eUsers.bob.email },
                select: { id: true },
              })
            ).id,
          },
        },
      }),
    ]);

    const settings = await prisma.userNotificationSettings.findUniqueOrThrow({
      where: { userId: bob.id },
    });
    originalThreadSetting = settings.mentionThreadReplies;
    originalLocale = bob.locale;
    originalTheme =
      (await prisma.userSettings.findUnique({ where: { userId: bob.id }, select: { theme: true } }))
        ?.theme ?? "theme-dark";
    originalMentionCount =
      (
        await prisma.channelReadState.findUnique({
          where: { channelId_userId: { channelId: textChannelId, userId: bob.id } },
          select: { mentionCount: true },
        })
      )?.mentionCount ?? 0;

    await prisma.role.create({
      data: {
        id: id("access-role"),
        isDefault: true,
        name: `E2E Access ${RUN}`,
        permissions: PermissionBits.VIEW_CHANNEL | PermissionBits.SEND_MESSAGES,
        position: 0,
        serverId,
      },
    });
    const role = await prisma.role.create({
      data: {
        id: id("role"),
        mentionable: true,
        name: `QA-${RUN}`,
        permissions: 0n,
        position: 50,
        serverId,
      },
    });
    await prisma.memberRole.create({
      data: { id: id("member-role"), memberId: bobMember.id, roleId: role.id },
    });

    const anchorContent = `${MARKER} @${e2eUsers.bob.username} bağlam çapası`;
    const roleContent = `${MARKER} @${role.name} rol kabulü`;
    const everyoneContent = `${MARKER} @everyone herkes kabulü`;
    const threadContent = `${MARKER} takip edilen thread yanıtı`;
    const dmContent = `${MARKER} @${e2eUsers.bob.username} DM kabulü`;

    await prisma.message.createMany({
      data: [
        {
          id: id("pre-2"),
          channelId: textChannelId,
          userId: alice.id,
          content: `${MARKER} önce iki`,
          clientNonce: id("pre-2"),
          createdAt: at(18_000),
        },
        {
          id: id("pre-1"),
          channelId: textChannelId,
          userId: alice.id,
          content: `${MARKER} önce bir`,
          clientNonce: id("pre-1"),
          createdAt: at(19_000),
        },
        {
          id: id("anchor"),
          channelId: textChannelId,
          userId: alice.id,
          content: anchorContent,
          clientNonce: id("anchor"),
          createdAt: at(20_000),
        },
        {
          id: id("post-1"),
          channelId: textChannelId,
          userId: alice.id,
          content: `${MARKER} sonra bir`,
          clientNonce: id("post-1"),
          createdAt: at(21_000),
        },
        {
          id: id("post-2"),
          channelId: textChannelId,
          userId: alice.id,
          content: `${MARKER} sonra iki`,
          clientNonce: id("post-2"),
          createdAt: at(22_000),
        },
        {
          id: id("role-message"),
          channelId: textChannelId,
          userId: alice.id,
          content: roleContent,
          clientNonce: id("role-message"),
          createdAt: at(10_000),
        },
        {
          id: id("everyone-message"),
          channelId: textChannelId,
          userId: alice.id,
          content: everyoneContent,
          clientNonce: id("everyone-message"),
          createdAt: at(8_000),
          mentionEveryone: true,
        },
        {
          id: id("thread-parent"),
          channelId: textChannelId,
          userId: alice.id,
          content: `${MARKER} thread üst mesajı`,
          clientNonce: id("thread-parent"),
          createdAt: at(4_000),
        },
        {
          id: id("thread-reply"),
          channelId: textChannelId,
          userId: alice.id,
          content: threadContent,
          clientNonce: id("thread-reply"),
          createdAt: at(6_000),
          threadParentId: id("thread-parent"),
        },
      ],
    });

    await prisma.messageMention.createMany({
      data: [
        {
          id: id("anchor-mention"),
          createdAt: at(20_000),
          kind: "SELF",
          messageId: id("anchor"),
          userId: bob.id,
        },
        {
          id: id("role-mention"),
          createdAt: at(10_000),
          kind: "ROLE",
          messageId: id("role-message"),
          roleId: role.id,
          userId: bob.id,
        },
      ],
    });
    await prisma.threadFollow.createMany({
      data: [
        {
          id: id("thread-follow-bob"),
          channelId: textChannelId,
          origin: "EXPLICIT",
          parentMessageId: id("thread-parent"),
          userId: bob.id,
        },
        {
          id: id("thread-follow-charlie"),
          channelId: textChannelId,
          mutedAt: at(5_000),
          origin: "EXPLICIT",
          parentMessageId: id("thread-parent"),
          userId: charlie.id,
        },
      ],
    });

    await prisma.dMMessage.create({
      data: {
        id: id("dm-message"),
        clientNonce: id("dm-message"),
        content: dmContent,
        conversationId,
        createdAt: at(2_000),
        userId: alice.id,
      },
    });
    await prisma.dMMessageMention.create({
      data: {
        id: id("dm-mention"),
        createdAt: at(2_000),
        messageId: id("dm-message"),
        userId: bob.id,
      },
    });

    const notifications = [
      { key: `channel-mention:${id("anchor")}:${bob.id}`, userId: bob.id, messageId: id("anchor") },
      {
        key: `channel-mention:${id("role-message")}:${bob.id}`,
        userId: bob.id,
        messageId: id("role-message"),
      },
      {
        key: `channel-everyone:${id("everyone-message")}:${bob.id}`,
        userId: bob.id,
        messageId: id("everyone-message"),
      },
      {
        key: `channel-everyone:${id("everyone-message")}:${charlie.id}`,
        userId: charlie.id,
        messageId: id("everyone-message"),
      },
      {
        key: `channel-thread-reply:${id("thread-reply")}:${bob.id}`,
        userId: bob.id,
        messageId: id("thread-reply"),
      },
      {
        key: `dm-message:${id("dm-message")}:${bob.id}`,
        userId: bob.id,
        messageId: id("dm-message"),
      },
    ];
    await prisma.notification.createMany({
      data: notifications.map((row) => ({
        actionUrl: `/channels/${serverId}/${textChannelId}`,
        body: MARKER,
        createdAt: at(30_000),
        dedupeKey: row.key,
        metadata: { messageId: row.messageId },
        title: "Mention E2E",
        type: "MENTION" as const,
        userId: row.userId,
      })),
    });
    await prisma.notification.create({
      data: {
        actionUrl: "/messages/friends",
        body: MARKER,
        dedupeKey: id("friend-notification"),
        title: "Friend E2E",
        type: "FRIEND_REQUEST",
        userId: bob.id,
      },
    });
    await prisma.user.update({ where: { id: bob.id }, data: { locale: "tr" } });

    return {
      anchorContent,
      dmContent,
      everyoneContent,
      roleContent,
      serverId,
      textChannelId,
      threadContent,
    };
  });
}

async function seedManyMentions(count: number): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const [alice, bob] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { email: e2eUsers.alice.email },
        select: { id: true },
      }),
      prisma.user.findUniqueOrThrow({ where: { email: e2eUsers.bob.email }, select: { id: true } }),
    ]);
    const now = Date.now() - 3_600_000;
    const messages = Array.from({ length: count }, (_, index) => ({
      channelId: fixture.textChannelId,
      clientNonce: `mentions-e2e-${RUN}-perf-${index}`,
      content: `${MARKER} performans kartı ${index}`,
      createdAt: new Date(now - index * 1_000),
      id: `mentions-e2e-${RUN}-perf-message-${index}`,
      userId: alice.id,
    }));
    await prisma.message.createMany({ data: messages });
    await prisma.messageMention.createMany({
      data: messages.map((message, index) => ({
        createdAt: message.createdAt,
        id: `mentions-e2e-${RUN}-perf-mention-${index}`,
        kind: "SELF" as const,
        messageId: message.id,
        userId: bob.id,
      })),
    });
    await prisma.notification.createMany({
      data: messages.map((message) => ({
        body: MARKER,
        dedupeKey: `channel-mention:${message.id}:${bob.id}`,
        title: "Mention E2E perf",
        type: "MENTION" as const,
        userId: bob.id,
      })),
    });
  });
}

async function cleanupManyMentions(): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    await prisma.notification.deleteMany({
      where: {
        dedupeKey: { startsWith: `channel-mention:mentions-e2e-${RUN}-perf-message-` },
      },
    });
    await prisma.message.deleteMany({
      where: { id: { startsWith: `mentions-e2e-${RUN}-perf-message-` } },
    });
  });
}

async function cleanup(): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    const [messages, dmMessages, bob] = await Promise.all([
      prisma.message.findMany({
        where: { content: { contains: MARKER } },
        select: { id: true, mentions: { select: { id: true } } },
      }),
      prisma.dMMessage.findMany({
        where: { content: { contains: MARKER } },
        select: { id: true, mentions: { select: { id: true } } },
      }),
      prisma.user.findUnique({ where: { email: e2eUsers.bob.email }, select: { id: true } }),
    ]);
    const messageIds = [...messages, ...dmMessages].map((row) => row.id);
    const mentionIds = [...messages, ...dmMessages].flatMap((row) =>
      row.mentions.map((item) => item.id),
    );

    await prisma.mentionState.deleteMany({
      where: { refId: { in: [...messageIds, ...mentionIds] } },
    });
    await prisma.notification.deleteMany({
      where: {
        OR: [
          { body: MARKER },
          { dedupeKey: { contains: RUN } },
          ...messageIds.map((messageId) => ({ dedupeKey: { contains: messageId } })),
        ],
      },
    });
    await prisma.message.deleteMany({ where: { id: { in: messages.map((row) => row.id) } } });
    await prisma.dMMessage.deleteMany({ where: { id: { in: dmMessages.map((row) => row.id) } } });
    await prisma.role.deleteMany({ where: { id: { contains: RUN } } });

    if (bob) {
      await prisma.userNotificationSettings.update({
        where: { userId: bob.id },
        data: { mentionThreadReplies: originalThreadSetting },
      });
      await prisma.userSettings.update({
        where: { userId: bob.id },
        data: { theme: originalTheme },
      });
      await prisma.user.update({
        where: { id: bob.id },
        data: { locale: originalLocale, theme: originalTheme },
      });
      await prisma.channelReadState.updateMany({
        where: { channelId: fixture?.textChannelId, userId: bob.id },
        data: { mentionCount: originalMentionCount },
      });
    }
  });
}

test.beforeAll(async () => {
  fixture = await seedCoreFixture();
});

test.afterAll(async () => {
  await cleanup();
});

test("1-4 · kullanıcı, rol, @herkes ve thread alıcı kümeleri", async ({ browser }) => {
  const bob = await openLoggedInPage(browser, "bob");
  const charlie = await openLoggedInPage(browser, "charlie");
  const alice = await openLoggedInPage(browser, "alice");

  try {
    await openMentions(bob.page);
    for (const content of [
      fixture.anchorContent,
      fixture.roleContent,
      fixture.everyoneContent,
      fixture.threadContent,
      fixture.dmContent,
    ]) {
      await expect(cardWithText(bob.page, content)).toBeVisible();
    }
    await expect(bob.page.getByTestId("app-nav-mentions")).toContainText(/\d/u);

    await openMentions(charlie.page, "/mentions?filter=role");
    await expect(cardWithText(charlie.page, fixture.everyoneContent)).toBeVisible();
    await expect(cardWithText(charlie.page, fixture.roleContent)).toHaveCount(0);
    await openMentions(charlie.page, "/mentions?filter=thread");
    await expect(cardWithText(charlie.page, fixture.threadContent)).toHaveCount(0);

    await openMentions(alice.page, "/mentions?filter=role");
    await expect(cardWithText(alice.page, fixture.everyoneContent)).toHaveCount(0);
  } finally {
    await Promise.all([bob.context.close(), charlie.context.close(), alice.context.close()]);
  }
});

test("5-6 · 20 okundu çevrimi, tümünü okundu ve geri alma", async ({ page }) => {
  await loginAs(page, "bob");
  await openMentions(page);
  const card = cardWithText(page, fixture.anchorContent);

  for (let index = 0; index < 20; index += 1) {
    const button = card.getByTestId("mention-card-toggle-read");
    const stateSaved = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/api/v1/mentions/") &&
        response.url().endsWith("/state") &&
        response.ok(),
    );
    await button.click();
    await stateSaved;
    await expect(button).toContainText(index % 2 === 0 ? "Okunmadı" : "Okundu");
  }

  await openMentions(page, "/mentions?filter=unread");
  await page.getByTestId("mentions-sidebar-mark-all").click();
  await expect(page.getByTestId("mentions-empty-state")).toBeVisible();
  expect(
    await withE2EDatabase(async (prisma) =>
      prisma.notification.count({
        where: { dedupeKey: `mentions-e2e-${RUN}-friend-notification`, read: false },
      }),
    ),
  ).toBe(1);
  await page.getByRole("button", { name: "Geri al" }).click();
  await expect(cardWithText(page, fixture.anchorContent)).toBeVisible();
});

test("7-8 · listeden kaldır mesajı silmez; Sonra oku kartı üste sabitler", async ({ page }) => {
  await loginAs(page, "bob");
  await openMentions(page);

  const roleCard = cardWithText(page, fixture.roleContent);
  await roleCard.getByTestId("mention-card-menu-button").click();
  await page.getByRole("menuitem", { name: "Listeden kaldır" }).click();
  await expect(roleCard).toHaveCount(0);
  expect(
    await withE2EDatabase((prisma) =>
      prisma.message.count({ where: { content: fixture.roleContent } }),
    ),
  ).toBe(1);

  const dmCard = cardWithText(page, fixture.dmContent);
  await dmCard.getByTestId("mention-card-menu-button").click();
  const savedForLater = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes("/api/v1/mentions/") &&
      response.url().endsWith("/state") &&
      response.ok(),
  );
  await page.getByRole("menuitem", { name: "Sonra oku" }).click();
  await savedForLater;
  await openMentions(page, "/mentions?filter=unread");
  await expect(page.getByTestId("mention-card").first()).toContainText("DM kabulü");
});

test("9-10 · satır içi yanıt ve ±2 bağlam", async ({ page }) => {
  await loginAs(page, "bob");
  await openMentions(page);
  const anchor = cardWithText(page, fixture.anchorContent);
  const reply = `${MARKER} satır içi yanıt`;

  await anchor.getByTestId("mention-card-reply").click();
  await anchor.getByTestId("mention-reply-field").fill(reply);
  await anchor.getByTestId("mention-reply-send").click();
  await expect(anchor.getByTestId("mention-card-stripe")).toHaveCount(0);
  await expect
    .poll(() => withE2EDatabase((prisma) => prisma.message.count({ where: { content: reply } })))
    .toBe(1);

  await anchor.getByTestId("mention-card-context").click();
  await expect(page.getByTestId("mention-context-row")).toHaveCount(5);
  await expect(page.getByTestId("mentions-feed-header-actions")).toHaveCount(0);
  await expect(page.getByTestId("mention-context-open")).toHaveAttribute(
    "href",
    new RegExp(`/channels/${fixture.serverId}/${fixture.textChannelId}.*message=`),
  );
});

test("11-12 · ayar kalıcılığı ve paylaşılan URL", async ({ page }) => {
  await loginAs(page, "bob");
  await openMentions(page, "/mentions?modal=settings");
  const threadSwitch = page.getByTestId("mention-settings-thread-switch");
  const before = await threadSwitch.getAttribute("aria-checked");
  await threadSwitch.click();
  await page.getByTestId("mention-settings-save").click();
  await page.reload();
  await openMentions(page, "/mentions?modal=settings");
  await expect(page.getByTestId("mention-settings-thread-switch")).toHaveAttribute(
    "aria-checked",
    before === "true" ? "false" : "true",
  );

  const shared = `/mentions?filter=unread&source=${fixture.serverId}&group=source`;
  await openMentions(page, shared);
  await expect(page).toHaveURL(
    new RegExp(`filter=unread.*source=${fixture.serverId}.*group=source`),
  );
  await expect(visibleTestId(page, "mentions-feed-tab-unread")).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("parity matrisi · 11 durum × 2 tema × 6 çözünürlük", async ({ page }, testInfo: TestInfo) => {
  await loginAs(page, "bob");
  const viewports = [
    [1360, 920, 16],
    [1600, 900, 16],
    [1920, 1080, 18],
    [2560, 1440, 24],
    [3840, 2160, 32],
    [5120, 1440, 24],
  ] as const;
  const states = [
    "/mentions",
    "/mentions?filter=unread",
    "/mentions?filter=role",
    "/mentions?filter=dm",
    "/mentions?panel=channel%3Amentions-e2e-placeholder",
    "/mentions",
    "/mentions",
    "/mentions?modal=settings",
    `/mentions?q=${RUN}-empty`,
    "/mentions",
    "/mentions?group=source",
  ] as const;

  for (const theme of ["theme-dark", "theme-light"] as const) {
    await setE2EUserTheme("bob", theme);
    for (const [width, height, rootFont] of viewports) {
      await page.setViewportSize({ width, height });
      for (const [index, path] of states.entries()) {
        await openMentions(page, path);
        if (index === 4) {
          const anchor = cardWithText(page, fixture.anchorContent);
          await anchor.getByTestId("mention-card-context").click();
        } else if (index === 5) {
          await cardWithText(page, fixture.anchorContent).getByTestId("mention-card-reply").click();
        } else if (index === 6) {
          await cardWithText(page, fixture.anchorContent)
            .getByTestId("mention-card-menu-button")
            .click();
        }
        await expectNoHorizontalOverflow(page);
        await expectNoVerticalOverflow(page);
        await expectNoClippedText(page);
      }
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
        .toBe(`${rootFont}px`);
      await page.screenshot({
        animations: "disabled",
        caret: "initial",
        path: testInfo.outputPath(`mentions-${theme}-${width}x${height}.png`),
      });
    }
  }
});

test("performans · bağımsız ray, ≤3 ilk istek, 200 kart sanallaştırma ve 60 FPS", async ({
  page,
}) => {
  await seedManyMentions(200);
  await loginAs(page, "bob");
  const mentionRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === "/api/v1/mentions" ||
      url.pathname === "/api/v1/mentions/counts" ||
      url.pathname === "/api/v1/app/summary"
    ) {
      mentionRequests.push(url.pathname);
    }
  });
  let releaseMentions!: () => void;
  const mentionsHeld = new Promise<void>((resolve) => {
    releaseMentions = resolve;
  });
  await page.route("**/api/v1/mentions?*", async (route) => {
    await mentionsHeld;
    await route.continue();
  });
  await openMentions(page);
  await expect(page.getByTestId("mentions-sidebar-unread-total")).toBeVisible();
  await expect(page.getByTestId("mentions-card-skeleton").first()).toBeVisible();
  expect(mentionRequests.length).toBeGreaterThan(0);
  expect(mentionRequests.length).toBeLessThanOrEqual(3);
  releaseMentions();
  await expect(cardWithText(page, "performans kartı").first()).toBeVisible();
  await page.unroute("**/api/v1/mentions?*");

  const feed = page.getByTestId("mentions-feed");
  for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
    const nextPage = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.ok() && url.pathname === "/api/v1/mentions" && url.searchParams.has("cursor");
    });
    await feed.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
    await nextPage;
  }
  expect(await page.getByTestId("mention-card").count()).toBeLessThan(80);
  const fps = await feed.evaluate(async (node) => {
    const started = performance.now();
    let frames = 0;
    await new Promise<void>((resolve) => {
      const step = () => {
        frames += 1;
        node.scrollTop = (node.scrollHeight - node.clientHeight) * Math.min(frames / 120, 1);
        if (frames >= 120) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return (frames * 1_000) / (performance.now() - started);
  });
  expect(fps).toBeGreaterThanOrEqual(55);
  await cleanupManyMentions();
});

test("mention:new eşdeğeri · açık akış yeni bildirimi kart ve şeritle alır", async ({
  browser,
}) => {
  const bob = await openLoggedInPage(browser, "bob");
  const alice = await openLoggedInPage(browser, "alice");
  const content = `${MARKER} canlı @${e2eUsers.bob.username}`;

  try {
    await bob.page.setViewportSize({ height: 520, width: 1280 });
    await openMentions(bob.page);
    const feed = bob.page.getByTestId("mentions-feed");
    await feed.hover();
    await bob.page.mouse.wheel(0, 60);
    await expect.poll(() => feed.evaluate((node) => node.scrollTop)).toBeGreaterThan(20);
    const visualAnchor = cardWithText(bob.page, fixture.anchorContent);
    await expect(visualAnchor).toBeInViewport();
    const beforeTop = await visualAnchor.evaluate((node) => node.getBoundingClientRect().top);

    await gotoTextChannelRoute(alice.page, fixture.serverId, fixture.textChannelId);
    await visibleTestId(alice.page, "message-input").fill(content);
    await alice.page.getByTestId(`mention-suggestion-${e2eUsers.bob.username}`).click();
    await visibleTestId(alice.page, "message-send-button").click();

    await expect(cardWithText(bob.page, content)).toBeAttached({ timeout: 20_000 });
    await expect(bob.page.getByTestId("mentions-new-strip")).toBeVisible();
    const afterTop = await visualAnchor.evaluate((node) => node.getBoundingClientRect().top);
    expect(Math.abs(afterTop - beforeTop)).toBeLessThan(24);
  } finally {
    await Promise.all([bob.context.close(), alice.context.close()]);
  }
});
