import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { ensureE2EUpcomingEvent, setE2EUserLocale } from "../../helpers/db";
import { gotoAppRoute } from "../../helpers/navigation";
import { MESSAGES_FRIENDS_ROUTE } from "../../../src/lib/messages/routes";

/**
 * Ana Sayfa 1a Faz 6 §8 — yan ekranlar ve **ölü link kalmadı** turu.
 *
 * Buradaki iddia "ekran açılıyor" değil: Ana Sayfa'daki yedi hedefin yedisi de
 * tıklanıyor ve varılan yer doğrulanıyor. Faz 2 ve Faz 5, rotalar yokken bile
 * gerçek hedeflere bağlamıştı; bu tur o kararın borcunu kapatıyor.
 */

const HOME_READY = { readyTestId: "home-command-center" };

/**
 * §5'in tablosu — kaynak yüzey, tıklanacak öğe, varılması gereken yol.
 *
 * `KALDIĞIN YER` kartının `Tümünü gör`ü listede **yok**: o hedef bir ekran değil, kartın kendi
 * penceresi. Kontrol bilerek `<button aria-haspopup="dialog">`, `<a href>` değil ve bunu
 * `home-cards.test.tsx` (`assert.doesNotMatch(control, /href=/)`) kilitliyor. Buradaki tur
 * "ölü link kalmadı" turudur; bir pencereyi rota sanmak listeyi yalancı yapardı.
 */
const HOME_LINKS = [
  { expected: "/mentions", label: "nav Bahsedilmeler", testId: "app-nav-mentions" },
  { expected: "/events", label: "nav Etkinlikler", testId: "app-nav-events" },
  { expected: "/mentions", label: "kart Bekleyenler", testId: "home-awaiting-card" },
  { expected: "/events", label: "kart Takvim", testId: "home-up-next-calendar" },
  {
    expected: MESSAGES_FRIENDS_ROUTE,
    label: "kart Tümü (Arkadaşlar)",
    testId: "home-friends-strip",
  },
] as const;

test.describe("Faz 6 — yan ekranlar", () => {
  /*
   * Palet komutları Türkçe yazılıyor; taban tohum kullanıcıyı `en` ile kuruyor
   * (`e2e/setup/e2e-database.ts`). Dili söylemeyen bir test, başka bir dosyanın yan etkisiyle
   * (`seedE2EDiscoverData` alice'i `tr`ye çekiyor) tesadüfen geçen, **sıraya bağımlı** bir
   * testtir. Ön koşul burada açıkça kuruluyor.
   */
  test.beforeEach(async () => {
    await setE2EUserLocale("alice", "tr");
  });

  test.afterAll(async () => {
    await setE2EUserLocale("alice", "en");
  });

  test("Ana Sayfa'daki yedi hedefin hepsi gerçek bir ekrana varıyor", async ({ page }) => {
    // `Takvim` butonu yalnız gerçek bir yaklaşan etkinlik varken çizilir; tur
    // atlamak yerine koşulu kuruyor, yoksa "ölü link yok" maddesi altı hedefle
    // yeşile döner.
    await ensureE2EUpcomingEvent("alice");
    await loginAs(page, "alice");

    for (const link of HOME_LINKS) {
      await gotoAppRoute(page, "/home", HOME_READY);

      // Nav satırının kendisi bir bağlantıdır; kartlarda hedefi kartın içindeki
      // bağlantıdan buluyoruz, çünkü bir kartta birden fazla bağlantı olabilir.
      const target = link.testId.startsWith("app-nav-")
        ? page.getByTestId(link.testId)
        : link.testId === "home-up-next-calendar"
          ? page.getByTestId(link.testId)
          : page.getByTestId(link.testId).locator(`a[href="${link.expected}"]`).first();

      await expect(target, `${link.label} çizilmedi`).toBeVisible({ timeout: 15_000 });
      await target.click();
      await page.waitForURL((url) => `${url.pathname}${url.search}` === link.expected, {
        timeout: 15_000,
      });
    }
  });

  test("palet komutları Bahsedilmeler ve Etkinlikler'e gidiyor", async ({ page }) => {
    await loginAs(page, "alice");

    // Ayarlar Ş13 (K10): `/inbox` rotası ve `nav:inbox` komutu silindi. Bekleyen listesinin
    // tam hâli Bahsedilmeler ekranıdır ve `nav:mentions` zaten oraya gidiyor.
    for (const [query, expected] of [
      ["Bahsedilmelere", "/mentions"],
      ["Etkinliklere", "/events"],
    ] as const) {
      await gotoAppRoute(page, "/home", HOME_READY);
      // Bu tur komut hedefini ölçer; kısayolun ayrı E2E sözleşmesi var.
      await page.getByTestId("home-command-search").click();
      await expect(page.getByTestId("command-palette")).toBeVisible();
      await page.keyboard.type(query);

      // Süzme sunucuya gidiyor: `toBeVisible` boş sorgunun **eski** ilk satırıyla da yeşile
      // döner ve test kanalın üstüne tıklar. Beklenen komut satırı gelene kadar tıklanmaz.
      const row = page.getByTestId("command-palette-row").first();
      await expect(row).toContainText(`${query} git`, { timeout: 15_000 });
      await row.click();

      await page.waitForURL((url) => url.pathname === expected, { timeout: 15_000 });
    }
  });

  /**
   * Bahsedilmeler Dalga 2 / Ş5: ekran `AppScreen` çipli listesinden `components/mentions/`
   * altındaki akışa geçti. Çipler yerine başlıktaki dört sekme var ve onlar `<button>` değil
   * `<Link>`; seçili olan `aria-pressed` değil `aria-current` taşıyor. İddia aynı kalıyor:
   * **süzme sunucuda**.
   */
  test("/mentions sekmeleri sunucuya yeni istek atıyor", async ({ page }) => {
    await loginAs(page, "alice");

    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/mentions")) {
        requests.push(new URL(request.url()).search);
      }
    });

    await gotoAppRoute(page, "/mentions", { readyTestId: "mentions-feed-header" });
    await expect(page.getByTestId("mentions-feed-tabs")).toBeVisible();
    await expect.poll(() => requests.length).toBeGreaterThan(0);

    const before = requests.length;
    await page.getByTestId("mentions-feed-tab-unread").click();

    // §6 — sekme bir sunucu isteğidir. İstemci süzmesi olsaydı bu sayı artmazdı ve
    // "okunmamış" yalnızca yüklenmiş sayfa için doğru olurdu.
    await expect.poll(() => requests.length).toBeGreaterThan(before);
    expect(requests.some((search) => search.includes("filter=unread"))).toBe(true);
    await expect(page).toHaveURL(/filter=unread/);
    await expect(page.getByTestId("mentions-feed-tab-unread")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  /*
   * Ş10 — `?view=calendar` / `?view=gantt` ve ay ızgarasının klavye turu, ölçtükleri ekranla
   * birlikte silindi. `/events` artık 4B takvim şeridi ekranı; kendi turu
   * `e2e/specs/events/events.spec.ts` dosyasında.
   */

  /**
   * SPEC-BAHSEDILMELER §0/§1 — Bahsedilmeler kabuğun **dört** kolonunu kullanır: sunucu rayı,
   * gezinme paneli, 276'lık bahsetme rayı ve akış. Gezinme paneli burada da duruyor.
   */
  test("/mentions nav paneli, bahsetme rayı ve akış başlığıyla geliyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/mentions", { readyTestId: "mentions-feed-header" });

    await expect(page.getByTestId("app-nav-panel")).toBeVisible();
    await expect(page.getByTestId("mentions-sidebar")).toBeVisible();
    await expect(page.getByTestId("mentions-feed-tabs")).toBeVisible();
  });
});
