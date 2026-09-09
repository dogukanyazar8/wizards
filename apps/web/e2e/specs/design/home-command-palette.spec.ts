import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { gotoAppRoute, visibleTestId } from "../../helpers/navigation";

/**
 * Komut paleti klavye sözleşmesi — `06-faz5` §5.2 ve §8.
 *
 * Birim testler paletin **kararlarını** sabitliyor (`lib/home/command-palette.test.ts`) ve
 * kaynağının yapısını (`components/command/command-palette.test.tsx`). Bu depoda DOM yok, o
 * yüzden gerçek tuş basışları — açılış, gezinme, `Esc`, odağın tetikleyiciye dönüşü — yalnız
 * burada kanıtlanabiliyor.
 */

const PALETTE = '[data-testid="command-palette"]';
const SEARCH_ENDPOINT = "/api/v1/search/command";

test.describe("Komut paleti", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ height: 920, width: 1360 });
    await loginAs(page, "alice");

    /**
     * Ekranın **görünür** olması hidrasyonun bittiği anlamına gelmiyor: kabuk sunucuda
     * çiziliyor, kısayolun dinleyicisi ise ancak hidrasyondan sonra kuruluyor. Erken basılan
     * `Ctrl+K` sessizce kayboluyor ve test hiç açılmayacak bir paleti bekliyor.
     *
     * Ana Sayfa'nın sorguları yalnız istemcide çalışıyor, o yüzden ilk `app/summary` yanıtı
     * "React ağacı canlı" demenin ölçülebilir hâli.
     */
    const hydrated = page.waitForResponse((response) =>
      response.url().includes("/api/v1/app/summary"),
    );

    await gotoAppRoute(page, "/home");
    // Rota geçişi sırasında eski ve yeni ağaç bir an birlikte duruyor; `getByTestId` katı
    // kipte iki eşleşmede kırılır. Deponun kendi kalıbı görünür olanı seçiyor.
    await expect(visibleTestId(page, "home-command-center")).toBeVisible();
    await hydrated;
    await expect(page).toHaveURL(/\/home$/u);
    await page.waitForLoadState("domcontentloaded");
  });

  test("Ctrl+K açar, tekrar basmak kapatır — ikinci palet açılmaz", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await expect(page.locator(PALETTE)).toBeVisible();
    await expect(page.locator(PALETTE)).toHaveCount(1);

    await page.keyboard.press("Control+k");
    await expect(page.locator(PALETTE)).toHaveCount(0);
  });

  test("üst çubuktaki arama alanı da açar ve kapanışta odak ona döner", async ({ page }) => {
    const search = page.getByTestId("home-command-search");

    await search.click();
    await expect(page.locator(PALETTE)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(PALETTE)).toHaveCount(0);
    await expect(search).toBeFocused();
  });

  test("açılışta girdi odakta, oklar seçimi gezdirir", async ({ page }) => {
    const results = page.waitForResponse((response) => response.url().includes(SEARCH_ENDPOINT));
    await page.keyboard.press("Control+k");

    const input = page.getByTestId("command-palette-input");
    await expect(input).toBeFocused();

    // Boş sorgunun sonuçları gelmeden ölçmek listeyi ortada yakalar: satırlar
    // değişince seçim ilk satıra döner ve ok tuşu ölçümü yalan söyler.
    await results;

    const rows = page.getByTestId("command-palette-row");
    await expect(rows.first()).toBeVisible();

    const firstId = await rows.first().getAttribute("id");
    await expect(input).toHaveAttribute("aria-activedescendant", firstId ?? "");

    await page.keyboard.press("ArrowDown");
    const secondId = await rows.nth(1).getAttribute("id");
    await expect(input).toHaveAttribute("aria-activedescendant", secondId ?? "");

    // Yukarı ok ilk satıra döner; liste dolanır, uçlarda takılmaz.
    await page.keyboard.press("ArrowUp");
    await expect(input).toHaveAttribute("aria-activedescendant", firstId ?? "");
  });

  test("girdide yazarken kısayol paleti yeniden açmaz, listeyi süzer", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.getByTestId("command-palette-input").fill("odak");

    await expect(page.locator(PALETTE)).toHaveCount(1);
    await expect(page.getByTestId("command-palette-row")).toHaveCount(1);
  });

  test("hiçbir sonuç dış bağlantı değildir", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette-row").first()).toBeVisible();

    const hrefs = await page
      .getByTestId("command-palette-row")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("href"))
          .filter((href): href is string => href !== null),
      );

    for (const href of hrefs) {
      expect(href.startsWith("/"), href).toBe(true);
      expect(href.startsWith("//"), href).toBe(false);
    }
  });

  test("arama sorgusu adres çubuğuna yazılmaz", async ({ page }) => {
    const before = page.url();

    await page.keyboard.press("Control+k");

    // Sorgunun gerçekten **gittiğini** bekle: aramanın hiç koşmadığı bir anda
    // URL'e bakmak testi bedavaya yeşil yapardı.
    const searched = page.waitForResponse((response) =>
      response.url().includes(`${SEARCH_ENDPOINT}?q=gizli`),
    );
    await page.getByTestId("command-palette-input").fill("gizli arama");
    await searched;

    expect(page.url()).toBe(before);
  });

  test("palet açıkken ikinci bir menü açılmaz", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await expect(page.locator(PALETTE)).toBeVisible();

    // Arkadaş kartına sağ tıklamak paletin arkasına bir menü açamaz: overlay
    // olayı yakalar ve palet kapanır (aynı anda iki panel yok — §6).
    const overlay = page.getByTestId("command-palette-overlay");
    await expect(overlay).toBeVisible();
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
  });
});
