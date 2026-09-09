import type { Page } from "@playwright/test";

import { resolveE2ETimeoutPolicy } from "@/lib/e2e/timeout-policy";
import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import {
  cleanupE2EDiscoverData,
  resetE2EDiscoverMembership,
  seedE2EDiscoverData,
  setE2EUserTheme,
  type E2EDiscoverFixture,
} from "../../helpers/db";
import {
  applyParityTheme,
  expectNoClippedText,
  expectNoHorizontalOverflow,
  waitForRootFontSize,
  type ParityTheme,
} from "../../helpers/design-parity";
import { gotoAppRoute, visibleTestId } from "../../helpers/navigation";

const { screenTestTimeoutMs } = resolveE2ETimeoutPolicy();
const THEMES = ["theme-light", "theme-dark"] as const satisfies readonly ParityTheme[];
const VIEWPORTS = [
  { expectedRootFontSize: 16, height: 920, label: "1360x920", width: 1360 },
  { expectedRootFontSize: 16, height: 900, label: "1600x900", width: 1600 },
  { expectedRootFontSize: 18, height: 1080, label: "1920x1080", width: 1920 },
  { expectedRootFontSize: 24, height: 1440, label: "2560x1440", width: 2560 },
  { expectedRootFontSize: 32, height: 2160, label: "3840x2160", width: 3840 },
  { expectedRootFontSize: 24, height: 1440, label: "5120x1440", width: 5120 },
] as const;

type ScreenshotState = {
  readonly fileStem: string;
  readonly id: string;
  readonly path: (fixture: E2EDiscoverFixture) => string;
  readonly readyTestId: string;
};

const SCREENSHOT_STATES: readonly ScreenshotState[] = [
  { fileStem: "tum-dizin", id: "01", path: () => "/discover", readyTestId: "discover-grid" },
  {
    fileStem: "kategori-oyun",
    id: "02",
    path: () => "/discover?cat=oyun",
    readyTestId: "discover-grid",
  },
  {
    fileStem: "filtre-calisma-online",
    id: "03",
    path: () => "/discover?cat=calisma&sort=online",
    readyTestId: "discover-filter-strip",
  },
  {
    fileStem: "arama-dil",
    id: "04",
    path: () => "/discover?q=dil",
    readyTestId: "discover-grid",
  },
  {
    fileStem: "kisiler",
    id: "05",
    path: () => "/discover?lane=people",
    readyTestId: "discover-grid",
  },
  {
    fileStem: "kanallar",
    id: "06",
    path: () => "/discover?lane=channels",
    readyTestId: "discover-grid",
  },
  {
    fileStem: "etkinlikler",
    id: "07",
    path: () => "/discover?lane=events",
    readyTestId: "discover-grid",
  },
  {
    fileStem: "profil-paneli",
    id: "08",
    path: (fixture) => `/discover?panel=${fixture.panelServerId}`,
    readyTestId: "server-profile-panel",
  },
  {
    fileStem: "katil-modali",
    id: "09",
    path: () => "/discover?modal=join",
    readyTestId: "discover-page",
  },
  {
    fileStem: "katilim-onayi",
    id: "10",
    path: () => "/discover",
    readyTestId: "discover-grid",
  },
  {
    fileStem: "bos-durum",
    id: "11",
    path: () => "/discover?q=zzzzzzz",
    readyTestId: "discover-empty-state",
  },
  {
    fileStem: "hata-502",
    id: "12",
    path: () => "/discover",
    readyTestId: "discover-error-state",
  },
];

function themeLabel(theme: ParityTheme): "acik" | "koyu" {
  return theme === "theme-light" ? "acik" : "koyu";
}

async function waitForDiscoverShell(page: Page): Promise<void> {
  await expect(visibleTestId(page, "discover-page")).toBeVisible({ timeout: 30_000 });
  await expect(visibleTestId(page, "discover-sidebar")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="app-startup-screen"]:visible')).toHaveCount(0, {
    timeout: 30_000,
  });
}

async function openDiscover(
  page: Page,
  path = "/discover",
  readyTestId = "discover-grid",
): Promise<void> {
  await gotoAppRoute(page, path, { readyTestId, timeout: 30_000 });
  await waitForDiscoverShell(page);
  await expect(page.getByTestId("discover-card-skeleton")).toHaveCount(0, { timeout: 30_000 });
}

async function prepareTheme(page: Page, theme: ParityTheme): Promise<void> {
  await setE2EUserTheme("alice", theme);
  await applyParityTheme(page, theme);
  await loginAs(page, "alice");
}

async function expectTheme(page: Page, theme: ParityTheme): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.className), { timeout: 10_000 })
    .toContain(theme);
}

async function firstServerCardNamed(page: Page, name: string) {
  const card = page.getByTestId("discover-server-card").filter({ hasText: name }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  return card;
}

async function joinFixtureServer(page: Page, fixture: E2EDiscoverFixture): Promise<void> {
  const card = await firstServerCardNamed(page, fixture.joinServerName);
  await card.getByRole("button", { name: "Katıl", exact: true }).click();
  await expect(page.getByTestId("discover-joined-banner")).toContainText(fixture.joinServerName, {
    timeout: 30_000,
  });
  await expect(card.getByRole("button", { name: "Katıldın", exact: true })).toBeVisible();
}

async function installDiscoverPaintMarks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen = new Set<string>();
    const record = (name: string, selector: string) => {
      if (seen.has(name) || !document.querySelector(selector)) {
        return;
      }
      seen.add(name);
      requestAnimationFrame(() => performance.mark(name));
    };
    const inspect = () => {
      record("discover-sidebar-painted", '[data-testid="discover-sidebar"]');
      record("discover-first-card-painted", '[data-testid="discover-server-card"]');
    };

    new MutationObserver(inspect).observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", inspect, { once: true });
  });
}

async function measureReferenceMetrics(page: Page) {
  return page.evaluate(() => {
    const required = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) {
        throw new Error(`Eksik parity yüzeyi: ${selector}`);
      }
      return node;
    };
    const card = required('[data-testid="discover-server-card"]');
    const tile = card.querySelector<HTMLElement>("span[data-tone]");
    const band = card.firstElementChild as HTMLElement | null;
    const tileRow = band?.nextElementSibling as HTMLElement | null;
    if (!tile || !band || !tileRow) {
      throw new Error("Sunucu kartı bant/tile yapısı eksik.");
    }

    return {
      cardRadius: Number.parseFloat(getComputedStyle(card).borderRadius),
      directoryWidth: required('[data-testid="discover-sidebar"]').getBoundingClientRect().width,
      panelWidth:
        document
          .querySelector<HTMLElement>('[data-testid="server-profile-panel"]')
          ?.getBoundingClientRect().width ?? null,
      serverCardBandHeight: band.getBoundingClientRect().height,
      serverCardTileMarginTop: Number.parseFloat(getComputedStyle(tileRow).marginTop),
      serverCardTileRing: getComputedStyle(tile).boxShadow,
      serverCardTileSize: tile.getBoundingClientRect().width,
    };
  });
}

test.describe.configure({ mode: "serial", timeout: Math.max(screenTestTimeoutMs, 120_000) });

test.describe("Keşfet Ş10 davranış ve parity kapısı", () => {
  let fixture: E2EDiscoverFixture;

  test.beforeAll(async () => {
    fixture = await seedE2EDiscoverData({ serverCount: 200 });
  });

  test.afterAll(async () => {
    await cleanupE2EDiscoverData();
    await setE2EUserTheme("alice", "theme-dark");
  });

  test.beforeEach(async () => {
    await resetE2EDiscoverMembership("alice");
  });

  test("/discover altı kategori ve doğru sayaçlarla açılır; referans ölçüleri korunur", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 920, width: 1360 });
    await loginAs(page, "alice");
    await openDiscover(page);

    await expect(page.getByTestId("app-nav-discover")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("discover-category-row")).toHaveCount(6);
    await expect(page.getByTestId("discover-category-pill")).toHaveCount(6);
    await expect(page.getByTestId("discover-sidebar-total")).toHaveText("200");
    await expect(page.getByTestId("discover-featured")).toContainText("Whispr Topluluğu");

    const expectedCounts = [
      ["Tümü", "200"],
      ["Oyun", "40"],
      ["İş", "40"],
      ["Çalışma", "40"],
      ["Kişisel", "40"],
      ["Destek", "40"],
    ] as const;
    for (const [label, count] of expectedCounts) {
      await expect(
        page.getByTestId("discover-category-row").filter({ hasText: label }),
      ).toContainText(count);
    }

    const metrics = await measureReferenceMetrics(page);
    expect(metrics).toMatchObject({
      cardRadius: 18,
      directoryWidth: 276,
      serverCardBandHeight: 46,
      serverCardTileMarginTop: -19,
      serverCardTileSize: 44,
    });
    expect(metrics.serverCardTileRing).toContain("3px");
  });

  test("kategori URL'i ve ızgarayı süzer; öne çıkan blok gizlenir", async ({ page }) => {
    await loginAs(page, "alice");
    await openDiscover(page);

    await page.getByTestId("discover-category-row").filter({ hasText: "Oyun" }).click();
    await expect(page).toHaveURL(/\/discover\?lane=servers&cat=oyun$/u);
    await expect(page.getByTestId("discover-featured")).toHaveCount(0);
    const cards = page.getByTestId("discover-server-card");
    await expect(cards).toHaveCount(24);
    expect(
      await cards.evaluateAll((nodes) => [
        ...new Set(nodes.map((node) => node.getAttribute("data-category"))),
      ]),
    ).toEqual(["oyun"]);
  });

  test("online sıralaması URL'i ve kart sırasını değiştirir", async ({ page }) => {
    await loginAs(page, "alice");
    await openDiscover(page);

    await expect(page.getByTestId("discover-server-card").first()).toContainText(
      "Whispr Topluluğu",
    );
    await page.getByTestId("discover-sort-row").filter({ hasText: "En çok çevrimiçi" }).click();
    await expect(page).toHaveURL(/sort=online/u);
    await expect(page.getByTestId("discover-server-card").first()).toContainText(
      fixture.onlineLeaderName,
    );
  });

  test("dört şerit kendi kart dilini çizer", async ({ page }) => {
    await loginAs(page, "alice");
    await openDiscover(page);

    const lanes = [
      ["Sunucular", "discover-server-card"],
      ["Kişiler", "discover-person-card"],
      ["Kanallar", "discover-channel-row"],
      ["Etkinlikler", "discover-event-card"],
    ] as const;
    for (const [label, testId] of lanes) {
      await page.getByRole("tab", { name: new RegExp(label, "u") }).click();
      await expect(page.getByTestId(testId).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("discover-grid").locator("[data-lane]")).toHaveAttribute(
        "data-lane",
        label === "Sunucular"
          ? "servers"
          : label === "Kişiler"
            ? "people"
            : label === "Kanallar"
              ? "channels"
              : "events",
      );
    }
  });

  test("arama 250 ms debounce uygular ve tuş başına istek açmaz", async ({ page }) => {
    await loginAs(page, "alice");
    await openDiscover(page);

    const requests: number[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/discover/servers") && request.url().includes("q=")) {
        requests.push(performance.now());
      }
    });

    const search = page.getByTestId("discover-search");
    const startedAt = performance.now();
    await search.pressSequentially("zzzzzzz", { delay: 15 });
    await expect(page.getByTestId("discover-empty-state")).toBeVisible({ timeout: 5_000 });
    expect(requests).toHaveLength(1);
    expect(requests[0]! - startedAt).toBeGreaterThanOrEqual(240);
  });

  test("Önizle paneli açar; panelde şeritler ve ikon grubu yoktur", async ({ page }) => {
    await page.setViewportSize({ height: 920, width: 1360 });
    await loginAs(page, "alice");
    await openDiscover(page);

    const card = await firstServerCardNamed(page, fixture.panelServerName);
    await card.getByRole("button", { name: "Önizle" }).click();
    await expect(page).toHaveURL(new RegExp(`panel=${fixture.panelServerId}`, "u"));
    await expect(page.getByTestId("server-profile-panel")).toBeVisible();
    await expect(page.getByTestId("discover-lane-group")).toHaveCount(0);
    await expect(page.getByTestId("discover-icon-group")).toHaveCount(0);

    const metrics = await measureReferenceMetrics(page);
    expect(metrics.panelWidth).toBe(326);
  });

  test("Esc önce modalı, sonra paneli kapatır", async ({ page }) => {
    await loginAs(page, "alice");
    await openDiscover(
      page,
      `/discover?panel=${fixture.panelServerId}&modal=join`,
      "server-profile-panel",
    );
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("server-profile-panel")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`panel=${fixture.panelServerId}$`, "u"));

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("server-profile-panel")).toHaveCount(0);
    await expect(page).toHaveURL(/\/discover$/u);
  });

  test("katılma banner, kart, ray ve Sunucularım Yeni durumunu birlikte günceller", async ({
    page,
  }) => {
    await loginAs(page, "alice");
    await openDiscover(page);
    await joinFixtureServer(page, fixture);

    await expect(page.getByTestId(`server-rail-server-${fixture.joinServerId}`)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId(`app-nav-server-${fixture.joinServerId}`)).toBeVisible();
    await expect(page.getByTestId(`app-nav-server-new-${fixture.joinServerId}`)).toHaveText("Yeni");
  });

  test("geri tuşu arama, şerit ve kategori durumunu sırayla geri sarar", async ({ page }) => {
    await loginAs(page, "alice");
    await openDiscover(page);

    await page.getByTestId("discover-search").fill("dil");
    await expect(page).toHaveURL(/q=dil/u);
    await page.getByRole("tab", { name: /Kişiler/u }).click();
    await expect(page).toHaveURL(/lane=people.*q=dil|q=dil.*lane=people/u);
    await page.getByTestId("discover-category-row").filter({ hasText: "Oyun" }).click();
    await expect(page).toHaveURL(/lane=servers.*cat=oyun.*q=dil/u);

    await page.goBack();
    await expect(page).toHaveURL(/lane=people/u);
    await expect(page).toHaveURL(/q=dil/u);
    await expect(page).not.toHaveURL(/cat=oyun/u);
    await page.goBack();
    await expect(page).toHaveURL(/q=dil/u);
    await expect(page).not.toHaveURL(/lane=people/u);
    await expect(page).not.toHaveURL(/cat=oyun/u);
  });

  test("kart boyutu ızgarayı değiştirir ve yenilemede korunur", async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1600 });
    await loginAs(page, "alice");
    await openDiscover(page);

    const sizeButton = page.getByRole("button", { name: "Kart boyutu" });
    const grid = page.getByTestId("discover-grid").locator('[data-layout="grid"]');
    const before = await grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns);
    await sizeButton.click();
    await expect(sizeButton).toHaveAttribute("aria-pressed", "true");
    const after = await grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns);
    expect(after).not.toBe(before);

    await page.reload();
    await waitForDiscoverShell(page);
    await expect(page.getByRole("button", { name: "Kart boyutu" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  for (const theme of THEMES) {
    test(`12 durum ekran kanıtı · ${theme}`, async ({ page }, testInfo) => {
      test.setTimeout(600_000);
      await page.setViewportSize({ height: 920, width: 1360 });
      await prepareTheme(page, theme);

      for (const state of SCREENSHOT_STATES) {
        const pageErrors: string[] = [];
        const capturePageError = (error: Error) => pageErrors.push(error.message);
        page.on("pageerror", capturePageError);
        await resetE2EDiscoverMembership("alice");
        if (state.id === "12") {
          await page.route("**/api/v1/discover/servers**", async (route) => {
            await route.fulfill({
              body: JSON.stringify({ code: "UPSTREAM_BAD_GATEWAY", error: "Bad gateway" }),
              contentType: "application/json",
              status: 502,
            });
          });
        }

        await openDiscover(page, state.path(fixture), state.readyTestId);
        if (state.id === "09") {
          await expect(page.getByRole("dialog")).toBeVisible();
        }
        if (state.id === "10") {
          await joinFixtureServer(page, fixture);
        }
        await expectTheme(page, theme);
        await page.screenshot({
          animations: "disabled",
          fullPage: false,
          path: testInfo.outputPath(`${state.id}-${state.fileStem}-${themeLabel(theme)}.png`),
        });
        expect(pageErrors, `${theme}/${state.id} tarayıcı hatası`).toEqual([]);
        page.off("pageerror", capturePageError);

        if (state.id === "12") {
          await page.unroute("**/api/v1/discover/servers**");
        }
      }
    });
  }

  for (const theme of THEMES) {
    test(`altı çözünürlük parity matrisi · ${theme}`, async ({ page }, testInfo) => {
      test.setTimeout(600_000);
      await prepareTheme(page, theme);
      const columns: Array<{ columns: number; viewport: string }> = [];

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ height: viewport.height, width: viewport.width });
        await openDiscover(page);
        await expectTheme(page, theme);
        await waitForRootFontSize(page, viewport.expectedRootFontSize);
        await expectNoHorizontalOverflow(page);
        await expectNoClippedText(page);
        await expect(page.getByTestId("discover-feed-header").getByRole("heading")).toHaveCSS(
          "white-space",
          "nowrap",
        );

        const gridColumns = await page
          .getByTestId("discover-grid")
          .locator('[data-layout="grid"]')
          .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(/\s+/u).length);
        columns.push({ columns: gridColumns, viewport: viewport.label });

        await gotoAppRoute(page, `/discover?panel=${fixture.panelServerId}`, {
          readyTestId: "server-profile-panel",
          timeout: 30_000,
        });
        const panelColumns = await page
          .getByTestId("discover-grid")
          .locator('[data-layout="grid"]')
          .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(/\s+/u).length);
        expect(panelColumns, `${viewport.label}: panel açıkken ızgara`).toBe(1);

        await openDiscover(page);
        await page.screenshot({
          animations: "disabled",
          fullPage: false,
          path: testInfo.outputPath(`cozunurluk-${viewport.label}-${themeLabel(theme)}.png`),
        });
      }

      for (let index = 1; index < columns.length; index += 1) {
        expect(columns[index]!.columns).toBeGreaterThanOrEqual(columns[index - 1]!.columns);
      }
      await testInfo.attach(`discover-resolution-columns-${theme}.json`, {
        body: Buffer.from(JSON.stringify(columns, null, 2)),
        contentType: "application/json",
      });
      console.info(`DISCOVER_RESOLUTION ${theme} ${JSON.stringify(columns)}`);
    });
  }

  test("Performance timeline ve 200 kart kaydırma ölçümü", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await installDiscoverPaintMarks(page);
    await page.setViewportSize({ height: 920, width: 1360 });
    await loginAs(page, "alice");
    await openDiscover(page);

    const paint = await page.evaluate(() => ({
      firstCard:
        performance.getEntriesByName("discover-first-card-painted").at(-1)?.startTime ?? -1,
      sidebar: performance.getEntriesByName("discover-sidebar-painted").at(-1)?.startTime ?? -1,
    }));
    expect(paint.sidebar).toBeGreaterThanOrEqual(0);
    expect(paint.firstCard).toBeGreaterThanOrEqual(paint.sidebar);

    const scroller = page.locator("#discover-lane-panel");
    await expect
      .poll(
        async () => {
          await scroller.evaluate((node) => {
            node.scrollTop = node.scrollHeight;
          });
          return page.getByTestId("discover-server-card").count();
        },
        { intervals: [400], timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(200);
    await expect(page.getByTestId("discover-server-card")).toHaveCount(200, { timeout: 30_000 });

    const scroll = await scroller.evaluate(async (node) => {
      node.scrollTop = 0;
      const durations: number[] = [];
      let previous = performance.now();
      const distance = Math.max(1, node.scrollHeight - node.clientHeight);
      for (let frame = 1; frame <= 120; frame += 1) {
        await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
        const now = performance.now();
        durations.push(now - previous);
        previous = now;
        node.scrollTop = (distance * frame) / 120;
      }

      return {
        droppedOver32Ms: durations.filter((duration) => duration > 32).length,
        maxFrameMs: Math.max(...durations),
        p95FrameMs: [...durations].sort((left, right) => left - right)[
          Math.floor(durations.length * 0.95)
        ],
        samples: durations.length,
      };
    });

    await testInfo.attach("discover-performance.json", {
      body: Buffer.from(JSON.stringify({ paint, scroll }, null, 2)),
      contentType: "application/json",
    });
    console.info(`DISCOVER_PERFORMANCE ${JSON.stringify({ paint, scroll })}`);
    expect(scroll.samples).toBe(120);
  });
});
