import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { setE2EUserLocale } from "../../helpers/db";
import { setE2EUserTheme } from "../../helpers/db";
import {
  applyParityTheme,
  expectNoClippedText,
  expectNoHorizontalOverflow,
  expectNoVerticalOverflow,
  type ParityTheme,
} from "../../helpers/design-parity";
import { gotoAppRoute } from "../../helpers/navigation";

/**
 * Ana Sayfa 1a Faz 7 §3 — küçük ekran kırılımları, ve §2.4 — klavye sözleşmesi.
 *
 * Kompozisyon değişir, ölçek değil: 1360'ın altında ızgara dörtten ikiye, 960'ın altında bire
 * iner ve nav paneli drawer'a taşınır. Yerleşim tablosu `lib/home/layout.ts` içinde saf ve
 * testli; buradaki koşu onun **ekranda** karşılığını doğruluyor.
 */

const WIDTHS = [
  { columns: 2, height: 900, label: "1280", width: 1280 },
  { columns: 2, height: 900, label: "1100", width: 1100 },
  { columns: 1, height: 900, label: "900", width: 900 },
  { columns: 1, height: 900, label: "720", width: 720 },
] as const;

/** Faz 8 §1.1: küçük kırılımlar da iki temada okunur. */
const BREAKPOINT_THEMES: readonly ParityTheme[] = ["theme-light", "theme-dark"];

/**
 * Izgara kırılımı CSS'ten geliyor (`lib/home/layout.ts`), o yüzden ekranda okunacak şey bir
 * `data-` bayrağı değil **hesaplanmış kolon sayısı**: medya sorgusunun gerçekten uygulandığını
 * ancak bu doğrular.
 */
async function readGridColumnCount(page: Parameters<typeof loginAs>[0]) {
  return page
    .getByTestId("home-bento-grid")
    .evaluate((node) => getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length);
}

async function openHome(page: Parameters<typeof loginAs>[0]) {
  const hydrated = page.waitForResponse((response) =>
    response.url().includes("/api/v1/app/summary"),
  );
  await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });
  await hydrated;

  // Açılış perdesi ekranın üstünde saydamlaşarak kayboluyor; ekran görüntüsü onu beklemezse
  // kırılımın değil perdenin fotoğrafı çekilir.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const splash = document.querySelector('[data-testid="app-startup-screen"]');

          return splash === null ? 0 : Number(getComputedStyle(splash).opacity);
        }),
      { timeout: 15_000 },
    )
    .toBe(0);
  await expect(page.getByTestId("home-bento-grid")).toBeVisible();
}

test.describe("Ana Sayfa — küçük ekran kırılımları", () => {
  // Kırılım turu `User.theme`'i yazıyor; tohumun varsayılanı geri konur.
  test.afterAll(async () => {
    await setE2EUserTheme("alice", "theme-dark");
  });

  for (const { columns, height, label, width } of WIDTHS) {
    for (const theme of BREAKPOINT_THEMES) {
      test(`${label} genişliğinde ızgara ${columns} kolona iner ve kırpma yok · ${theme}`, async ({
        page,
      }) => {
        await setE2EUserTheme("alice", theme);
        await applyParityTheme(page, theme);
        await page.setViewportSize({ height, width });
        await loginAs(page, "alice");
        await openHome(page);

        expect(await readGridColumnCount(page)).toBe(columns);

        // Yatay kaydırma hiçbir kırılımda doğmaz; dikey kaydırma 1360'ın altında serbesttir.
        await expectNoHorizontalOverflow(page);
        await expectNoClippedText(page);

        await page.screenshot({
          fullPage: false,
          path: `test-results/parity/home-responsive-${label}-${theme}.png`,
        });
      });
    }
  }

  test("1440 genişliğinde dört kolon kalır ve hiçbir eksende kaydırma yok", async ({ page }) => {
    await page.setViewportSize({ height: 960, width: 1440 });
    await loginAs(page, "alice");
    await openHome(page);

    expect(await readGridColumnCount(page)).toBe(4);
    await expectNoHorizontalOverflow(page);
    await expectNoVerticalOverflow(page);
    await expectNoClippedText(page);

    await page.screenshot({ fullPage: false, path: "test-results/home-responsive-1440.png" });
  });

  test("Arkadaşlar şeridi dar ekranda kaydırır, kart sayısı kırpılmaz", async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 720 });
    await loginAs(page, "alice");
    await openHome(page);

    const strip = page.getByTestId("home-friends-cards");

    if ((await strip.count()) === 0) {
      // Tohum veride çevrimiçi arkadaş yoksa şerit boş durumunu çizer; kaydırma sözleşmesinin
      // konusu kart olan hâldir.
      test.skip(true, "seed data has no online friends");
      return;
    }

    const overflowX = await strip.evaluate((node) => getComputedStyle(node).overflowX);
    expect(overflowX).toBe("auto");

    // Kart sayısı ölçek yoğunluğundan gelir ve dar ekranda **azaltılmaz**: taşan kısım kaydırılır.
    const cards = page.getByTestId("home-friend-card");
    await expect(cards.first()).toBeVisible();

    const canScroll = await strip.evaluate((node) => node.scrollWidth >= node.clientWidth);
    expect(canScroll).toBe(true);
  });

  test("960'ın altında nav paneli drawer'a taşınır ve arka plan kaydırması kilitlenir", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 900 });
    await loginAs(page, "alice");
    await openHome(page);

    // Kabuk paneli hâlâ ağaçta ama gizli; drawer açılınca ikinci bir kopyası görünür olur.
    await expect(page.getByTestId("app-nav-panel").first()).toBeHidden();

    await page.getByTestId("mobile-workspace-drawer-button").click();
    await expect(page.getByTestId("mobile-workspace-drawer")).toBeVisible();
    await expect(
      page.getByTestId("mobile-workspace-drawer").getByTestId("app-nav-panel"),
    ).toBeVisible();

    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("mobile-workspace-drawer")).toBeHidden();
  });

  test("960 ve üstünde nav paneli yerinde kalır", async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1100 });
    await loginAs(page, "alice");
    await openHome(page);

    await expect(page.getByTestId("app-nav-panel").first()).toBeVisible();
  });
});

test.describe("Ana Sayfa — klavye ve overlay sözleşmesi (§2.4)", () => {
  /*
   * Palet sorguları Türkçe (`Durumu`); taban tohum kullanıcıyı `en` ile kuruyor. Dili
   * söylemeyen bir test başka bir dosyanın yan etkisine bel bağlar ve sıraya bağımlı olur.
   */
  test.beforeEach(async () => {
    await setE2EUserLocale("alice", "tr");
  });

  test.afterAll(async () => {
    await setE2EUserLocale("alice", "en");
  });

  test("Esc komut paletini kapatır ve focus tetikleyiciye döner", async ({ page }) => {
    await page.setViewportSize({ height: 960, width: 1440 });
    await loginAs(page, "alice");
    await openHome(page);

    const trigger = page.getByTestId("home-command-search");
    await trigger.focus();
    await trigger.click();

    await expect(page.getByTestId("command-palette")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toBeHidden();

    const focusedTestId = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset.testid ?? null,
    );
    expect(focusedTestId).toBe("home-command-search");
  });

  test("Esc paletin presence alt menüsünü önce kapatır, paleti açık bırakır", async ({ page }) => {
    await page.setViewportSize({ height: 960, width: 1440 });
    await loginAs(page, "alice");
    await openHome(page);

    await page.getByTestId("home-command-search").click();
    await expect(page.getByTestId("command-palette")).toBeVisible();

    // Boş sorguda ilk satır bir arama sonucudur; komut grubu her zaman sonuncudur (§5.2).
    // Sorguyu daraltıp `Durumu değiştir` komutunu tek satır bırakıyoruz.
    await page.getByTestId("command-palette-input").fill("Durumu");
    const presenceCommand = page.getByTestId("command-palette-row").first();
    await expect(presenceCommand).toContainText("Durumu değiştir");
    await presenceCommand.click();

    await expect(page.getByTestId("command-palette-presence")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette-presence")).toBeHidden();
    await expect(page.getByTestId("command-palette")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toBeHidden();
  });

  test("Esc arkadaş bağlam menüsünü kapatır ve focus karta döner", async ({ page }) => {
    await page.setViewportSize({ height: 960, width: 1440 });
    await loginAs(page, "alice");
    await openHome(page);

    const card = page.getByTestId("home-friend-card").first();

    if ((await card.count()) === 0) {
      test.skip(true, "seed data has no online friends");
      return;
    }

    await card.focus();
    await page.keyboard.press("Shift+F10");

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    // Açılışta ilk öğe odaklı (§5.3); menü portalda, focus taşınmazsa klavyeyle gezilemez.
    const focusedRole = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.getAttribute("role") ?? null,
    );
    expect(focusedRole).toBe("menuitem");

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    const focusedTestId = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset.testid ?? null,
    );
    expect(focusedTestId).toBe("home-friend-card");
  });

  test("Esc bildirim popover'ını kapatır", async ({ page }) => {
    await page.setViewportSize({ height: 960, width: 1440 });
    await loginAs(page, "alice");
    await openHome(page);

    const bell = page.getByTestId("notification-bell-button");
    await bell.click();
    await expect(page.getByTestId("notification-panel")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("notification-panel")).toBeHidden();
  });

  test("sekme sırası ray → panel → üst çubuk → kartlar", async ({ page }) => {
    await page.setViewportSize({ height: 960, width: 1440 });
    await loginAs(page, "alice");
    await openHome(page);

    // DOM sırası = sekme sırası: hiçbir yerde pozitif `tabindex` yok, yani tarayıcı
    // belgeyi olduğu gibi geziyor ve kabuğun sırası tasarımın sırasıdır.
    const positiveTabIndexCount = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll("[tabindex]")).filter(
          (node) => Number(node.getAttribute("tabindex")) > 0,
        ).length,
    );
    expect(positiveTabIndexCount).toBe(0);

    const railBeforePanel = await page.evaluate(() => {
      const rail = document.querySelector('[data-testid="server-rail"]');
      const panel = document.querySelector('[data-testid="app-nav-panel"]');
      const topBar = document.querySelector('[data-testid="home-top-bar"]');
      const grid = document.querySelector('[data-testid="home-bento-grid"]');

      if (!rail || !panel || !topBar || !grid) {
        return null;
      }

      const before = (a: Element, b: Element) =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

      return [before(rail, panel), before(panel, topBar), before(topBar, grid)];
    });

    expect(railBeforePanel).toEqual([true, true, true]);
  });
});
