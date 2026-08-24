import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { ensureE2EUpcomingEvent } from "../../helpers/db";
import { gotoAppRoute } from "../../helpers/navigation";

/**
 * Ana Sayfa 1a Faz 6 §8 — yan ekranlar ve **ölü link kalmadı** turu.
 *
 * Buradaki iddia "ekran açılıyor" değil: Ana Sayfa'daki yedi hedefin yedisi de
 * tıklanıyor ve varılan yer doğrulanıyor. Faz 2 ve Faz 5, rotalar yokken bile
 * gerçek hedeflere bağlamıştı; bu tur o kararın borcunu kapatıyor.
 */

const HOME_READY = { readyTestId: "home-command-center" };

/** §5'in tablosu — kaynak yüzey, tıklanacak öğe, varılması gereken yol. */
const HOME_LINKS = [
  { expected: "/mentions", label: "nav Bahsedilmeler", testId: "app-nav-mentions" },
  { expected: "/events", label: "nav Etkinlikler", testId: "app-nav-events" },
  { expected: "/inbox", label: "kart Gelen kutusu", testId: "home-awaiting-card" },
  { expected: "/events", label: "kart Takvim", testId: "home-up-next-calendar" },
  { expected: "/messages", label: "kart Tümünü gör", testId: "home-continue-card" },
  { expected: "/messages", label: "kart Tümü (Arkadaşlar)", testId: "home-friends-strip" },
] as const;

test.describe("Faz 6 — yan ekranlar", () => {
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

  test("palet komutları Bahsedilmeler, Gelen kutusu ve Etkinlikler'e gidiyor", async ({ page }) => {
    await loginAs(page, "alice");

    for (const [query, expected] of [
      ["Bahsedilmelere", "/mentions"],
      ["Gelen kutusuna", "/inbox"],
      ["Etkinliklere", "/events"],
    ] as const) {
      await gotoAppRoute(page, "/home", HOME_READY);
      await page.keyboard.press("Control+k");
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

  test("/inbox kaynak çipleri sunucuya yeni istek atıyor", async ({ page }) => {
    await loginAs(page, "alice");

    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/app/awaiting")) {
        requests.push(new URL(request.url()).search);
      }
    });

    await gotoAppRoute(page, "/inbox", { readyTestId: "inbox-screen" });
    await expect(page.getByTestId("inbox-card")).toBeVisible();
    await expect.poll(() => requests.length).toBeGreaterThan(0);

    const before = requests.length;
    await page.getByTestId("inbox-filter-friend_request").click();

    await expect.poll(() => requests.length).toBeGreaterThan(before);
    expect(requests.some((search) => search.includes("source=friend_request"))).toBe(true);
    // Ana Sayfa kartı altı satır ister; gelen kutusu listenin tamamını.
    expect(requests.some((search) => search.includes("limit=100"))).toBe(true);
  });

  /*
   * Ş10 — `?view=calendar` / `?view=gantt` ve ay ızgarasının klavye turu, ölçtükleri ekranla
   * birlikte silindi. `/events` artık 4B takvim şeridi ekranı; kendi turu
   * `e2e/specs/events/events.spec.ts` dosyasında.
   */

  test("yan ekranlar nav paneliyle ve aynı üst çubukla geliyor", async ({ page }) => {
    await loginAs(page, "alice");

    // Bahsedilmeler bu döngüden çıktı: Ş5 sonrası ekranın `AppScreen` başlığı ve
    // `-subtitle` / `-content` kutuları yok, kendi akış başlığı ve rayı var (aşağıda).
    // Etkinlikler de Ş10 sonrası çıktı: aynı gerekçe, kendi akış başlığı ve ajanda rayı var.
    for (const [path, testId] of [["/inbox", "inbox-screen"]] as const) {
      await gotoAppRoute(page, path, { readyTestId: testId });
      await expect(page.getByTestId("app-nav-panel")).toBeVisible();
      await expect(page.getByTestId("home-command-search")).toBeVisible();
      // Alt satır her ekranda var; Etkinlikler'de metni yok, kutusu duruyor.
      await expect(page.getByTestId(`${testId}-subtitle`)).toHaveCount(1);
      // §1 — bu iki ekranda kaydırma serbest.
      await expect(page.getByTestId(`${testId}-content`)).toBeVisible();
    }
  });

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
