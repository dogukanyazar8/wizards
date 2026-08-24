import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EServerRoute, setE2EUserTheme, withE2EDatabase } from "../../helpers/db";
import { gotoAppRoute, visibleTestId } from "../../helpers/navigation";
import { e2eUsers } from "../../helpers/test-data";
import { EN_MESSAGES } from "@/lib/locale/messages/en";

/**
 * Etkinlikler (4B · Takvim şeridi) — Ş10 §5, dokuz senaryo.
 *
 * Birim süitleri her yüzeyin **şeklini** kanıtlıyor; bu tur **kablolamayı** kanıtlıyor:
 * gerçek bir sunucu, gerçek bir veritabanı, gerçek bir oturum. Bir tıklamanın üç ayrı yeri
 * (kart, sağ ray ve başlık sayacı) aynı anda oynatıp oynatmadığı yalnız burada görülebilir —
 * üçü ayrı bileşen ve üçünün de kendi süiti yeşil.
 *
 * Sıra **seri**: senaryolar aynı tohum satırlarını okuyor ve biri RSVP yazıyor.
 */

test.describe.configure({ mode: "serial", timeout: 90_000 });

const RUN = `${Date.now().toString(36)}-${process.pid}`;
const EVENTS_READY = { readyTestId: "events-feed-header" } as const;

/**
 * Tohum hesapların dili `en` (`e2e-database.ts`), o yüzden metin iddiaları sözlükten okunuyor.
 * Sabit Türkçe dize yazmak turu tohumun diline çivilerdi ve i18n'in kendisini test etmezdi.
 */
const COPY = EN_MESSAGES as unknown as Record<string, string>;

type EventsFixture = {
  liveId: string;
  serverId: string;
  todayId: string;
  todayTitle: string;
  tomorrowTitle: string;
  voiceChannelId: string;
  weekTitle: string;
};

let fixture: EventsFixture;

/**
 * Tohum veri etkinlik taşımıyor; tur onu kendisi kuruyor. İsimler koşuya özgü (`RUN`), yani
 * ikinci bir koşu birincinin satırlarını okumuyor ve temizlik `deleteMany` ile tek yerden
 * yapılıyor.
 *
 * Saatler **bugüne** göre kuruluyor: gün kovaları (`today` / `tomorrow` / `week`) sunucuda
 * izleyicinin takvim gününden türüyor ve sabit bir tarih yazsaydım süit takvimde ilerledikçe
 * sessizce başka bir gruba düşerdi.
 */
async function seedEvents(): Promise<EventsFixture> {
  const { serverId, voiceChannelId } = await getE2EServerRoute();
  const now = Date.now();
  const hours = (count: number) => new Date(now + count * 60 * 60 * 1000);

  const todayTitle = `E2E Bugünkü Oyun Gecesi ${RUN}`;
  const tomorrowTitle = `E2E Yarınki Toplantı ${RUN}`;
  const weekTitle = `E2E Haftanın Atölyesi ${RUN}`;
  const liveTitle = `E2E Canlı Yayın ${RUN}`;

  return withE2EDatabase(async (prisma) => {
    const alice = await prisma.user.findUniqueOrThrow({
      select: { id: true },
      where: { email: e2eUsers.alice.email },
    });

    const rows = await Promise.all(
      [
        {
          channelId: voiceChannelId,
          entityType: "VOICE" as const,
          kind: "GAME" as const,
          name: todayTitle,
          scheduledEndAt: hours(4),
          scheduledStartAt: hours(3),
          status: "SCHEDULED" as const,
        },
        {
          channelId: voiceChannelId,
          entityType: "VOICE" as const,
          kind: "LIVE" as const,
          name: liveTitle,
          scheduledEndAt: hours(1),
          scheduledStartAt: hours(-1),
          status: "ACTIVE" as const,
        },
        {
          channelId: voiceChannelId,
          entityType: "VOICE" as const,
          kind: "MEETING" as const,
          name: tomorrowTitle,
          scheduledEndAt: hours(27),
          scheduledStartAt: hours(26),
          status: "SCHEDULED" as const,
        },
        {
          channelId: voiceChannelId,
          entityType: "VOICE" as const,
          kind: "WORKSHOP" as const,
          name: weekTitle,
          scheduledEndAt: hours(75),
          scheduledStartAt: hours(74),
          status: "SCHEDULED" as const,
        },
      ].map((data) =>
        prisma.scheduledEvent.create({
          data: { ...data, creatorId: alice.id, serverId },
          select: { id: true, name: true },
        }),
      ),
    );

    const byName = new Map(rows.map((row) => [row.name, row.id]));

    return {
      liveId: byName.get(liveTitle) ?? "",
      serverId,
      todayId: byName.get(todayTitle) ?? "",
      todayTitle,
      tomorrowTitle,
      voiceChannelId,
      weekTitle,
    };
  });
}

async function clearSeededEvents(): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    await prisma.scheduledEvent.deleteMany({ where: { name: { contains: RUN } } });
  });
}

function cardWithTitle(page: Page, title: string) {
  return page.getByTestId("event-card").filter({ hasText: title });
}

/** Başlık sayacı `Katılacağım` sekmesinin pilinde; pil yalnız sayı > 0 iken çizilir. */
async function readGoingPill(page: Page): Promise<number> {
  const pill = page.getByTestId("events-feed-tab-pill-going");

  if ((await pill.count()) === 0) {
    return 0;
  }

  return Number.parseInt((await pill.innerText()).trim(), 10) || 0;
}

test.beforeAll(async () => {
  await clearSeededEvents();
  fixture = await seedEvents();
});

test.afterAll(async () => {
  await clearSeededEvents();
});

test.describe("Etkinlikler — 4B takvim şeridi", () => {
  /** §5.1 */
  test("`/events` ızgarayı ve 300'lük ajanda rayını birlikte çiziyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/events", EVENTS_READY);

    // Sol taraf dokunulmadı: kabuk hâlâ orada ve `Etkinlikler` satırı aktif.
    await expect(visibleTestId(page, "app-nav-panel")).toBeVisible();
    await expect(page.getByTestId("app-nav-events")).toHaveAttribute("aria-current", "page");

    await expect(visibleTestId(page, "events-week-strip")).toBeVisible();
    await expect(visibleTestId(page, "event-grid")).toBeVisible();
    await expect(visibleTestId(page, "event-agenda-rail")).toBeVisible();

    // Hafta şeridi her zaman yedi kutu; yokluk "bu hafta boş" demek değil, "sorulmadı" demek.
    await expect(page.getByTestId("events-week-dot-row")).toHaveCount(7);

    await expect(cardWithTitle(page, fixture.todayTitle)).toBeVisible();
    await expect(cardWithTitle(page, fixture.tomorrowTitle)).toBeVisible();

    // Sağ sütunun genişliği sözlükten (300 px = 18.75rem, ölçeğe göre büyür).
    const railWidth = await page
      .getByTestId("events-right-column")
      .evaluate((node) => node.getBoundingClientRect().width);
    expect(railWidth).toBeGreaterThan(0);
  });

  /** §5.2 — üçü de **aynı** etkileşimde. */
  test("`Katıl` kartı, sağ rayı ve başlık sayacını aynı anda güncelliyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/events", EVENTS_READY);

    const card = cardWithTitle(page, fixture.todayTitle);
    await expect(card).toBeVisible();

    const before = await readGoingPill(page);
    const going = card.getByTestId("event-card-going");
    await expect(going).toHaveAttribute("aria-pressed", "false");

    await going.click();

    // 1) Kartın kendisi.
    await expect(going).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
    await expect(going).toContainText(COPY["events.card.joined"] ?? "");

    // 2) Sağ raydaki `Katılacağım` listesi.
    await expect(
      page.getByTestId("event-agenda-going-row").filter({ hasText: fixture.todayTitle }),
    ).toBeVisible({ timeout: 15_000 });

    // 3) Başlık sayacı.
    await expect.poll(() => readGoingPill(page), { timeout: 15_000 }).toBe(before + 1);

    // SPEC §7 — yalnız `Katıl` onay şeridini açar.
    await expect(visibleTestId(page, "events-rsvp-strip")).toBeVisible();
  });

  /** §5.3 */
  test("karta tıklamak paneli açıyor; sekme grubu, ikon grubu ve ray kayboluyor", async ({
    page,
  }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/events", EVENTS_READY);

    await expect(visibleTestId(page, "events-feed-tabs")).toBeVisible();
    await expect(visibleTestId(page, "events-feed-actions")).toBeVisible();

    await cardWithTitle(page, fixture.tomorrowTitle).getByTestId("event-card-title").click();

    await expect(visibleTestId(page, "event-detail-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/panel=/u);

    // SPEC §3.1 daralma kuralı: `display:none` değil, DOM'dan düşme.
    await expect(page.getByTestId("events-feed-tabs")).toHaveCount(0);
    await expect(page.getByTestId("events-feed-actions")).toHaveCount(0);
    // Sağ sütun tek: ray gizlenmiyor, `unmount` oluyor.
    await expect(page.getByTestId("event-agenda-rail")).toHaveCount(0);
  });

  /** §5.4 */
  test("`Esc` paneli kapatıyor, ray geri geliyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/events", EVENTS_READY);

    await cardWithTitle(page, fixture.tomorrowTitle).getByTestId("event-card-title").click();
    await expect(visibleTestId(page, "event-detail-panel")).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("event-detail-panel")).toHaveCount(0, { timeout: 15_000 });
    await expect(visibleTestId(page, "event-agenda-rail")).toBeVisible();
    await expect(visibleTestId(page, "events-feed-tabs")).toBeVisible();
    await expect(page).not.toHaveURL(/panel=/u);
  });

  /** §5.5 */
  test("`Oluştur` modalı açılıyor, tür kanal listesini süzüyor, `Esc` kapatıyor", async ({
    page,
  }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/events", EVENTS_READY);

    await page.getByTestId("events-feed-create").click();

    await expect(visibleTestId(page, "events-kind-picker")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/modal=create/u);
    // K6 — tekrar alanı yok; tek geçişi alt metnin kendisi.
    await expect(page.getByTestId("events-create-title")).toBeVisible();

    // K10 — `voice` sesli kanal ister; tohum sunucunun tek sesli kanalı listede.
    await page.getByTestId("events-kind-voice").click();
    await page.getByTestId("events-place-trigger").click();
    await expect(visibleTestId(page, "events-place-panel")).toBeVisible();
    await expect(page.getByTestId(`events-place-channel-${fixture.voiceChannelId}`)).toBeVisible();

    // `meeting` metin kanallarını da kabul ediyor; `live` yalnız sahne — tohumda sahne yok,
    // o yüzden liste boşalıyor ve alan bunu söylüyor.
    await page.getByTestId("events-kind-live").click();
    await page.getByTestId("events-place-trigger").click();
    await expect(page.getByTestId(`events-place-channel-${fixture.voiceChannelId}`)).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("events-kind-picker")).toHaveCount(0, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/modal=create/u);
  });

  /** §5.6 — K9: oklar **hafta** adımlar. */
  test("hafta şeridi `›` bir hafta ileri götürüyor; geri tuşu geri alıyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/events", EVENTS_READY);

    // Etiket görünen haftanın ayını yazar (K9); şerit yüklendi mi sorusunun cevabı bu.
    await expect(visibleTestId(page, "events-week-label")).not.toBeEmpty();

    await page.getByTestId("events-week-next").click();
    await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}/u, { timeout: 15_000 });

    const forward = new URL(page.url()).searchParams.get("week");
    expect(forward).toMatch(/^\d{4}-\d{2}-\d{2}$/u);

    await page.getByTestId("events-week-next").click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("week"), { timeout: 15_000 })
      .not.toBe(forward);

    const twice = new URL(page.url()).searchParams.get("week") ?? "";
    // İki adım = 14 gün. Ay adımlasaydı fark 28'den büyük olurdu.
    expect(Date.parse(`${twice}T00:00:00.000Z`) - Date.parse(`${forward}T00:00:00.000Z`)).toBe(
      7 * 24 * 60 * 60 * 1000,
    );

    // K9 — şerit bir **gezinme** aracı, bir süzgeç değil; okların yazımı `push`. Geri tuşu
    // tek adım geri alır: iki ileriden sonra bir geri, birinci adımın haftasına döner.
    await page.goBack();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("week"), { timeout: 15_000 })
      .toBe(forward);
    await expect(visibleTestId(page, "events-week-label")).not.toBeEmpty();
  });

  /** §5.7 */
  test("filtre çipi kaldırılınca URL'den o eksen düşüyor", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, `/events?time=week&source=${fixture.serverId}`, EVENTS_READY);

    await expect(visibleTestId(page, "events-filter-bar")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("events-filter-remove-time").click();
    await expect.poll(() => new URL(page.url()).searchParams.get("time")).toBe(null);
    // Diğer eksen düşmedi: çip kaldırmak bir eksen siler, hepsini değil.
    expect(new URL(page.url()).searchParams.get("source")).toBe(fixture.serverId);

    await page.getByTestId("events-filter-clear-all").click();
    await expect.poll(() => new URL(page.url()).searchParams.get("source")).toBe(null);
    await expect(page.getByTestId("events-filter-bar")).toHaveCount(0);
  });

  /**
   * §5.8 — tema **hesap tercihinden** geliyor (`UserSettings.theme`); `localStorage`'a yazmak
   * yetmez, sunucu ilk boyayı kendi kaydettiği sınıfla çiziyor.
   */
  test("aydınlık temada aynı akış", async ({ page }) => {
    await setE2EUserTheme("alice", "theme-light");

    try {
      await loginAs(page, "alice");
      await gotoAppRoute(page, "/events", EVENTS_READY);

      await expect(page.locator("html")).toHaveClass(/theme-light/u);
      await expect(visibleTestId(page, "event-grid")).toBeVisible();
      await expect(visibleTestId(page, "event-agenda-rail")).toBeVisible();

      // Hiçbir parça tek temaya sabit değil: kart zemini açık temada da token'dan geliyor.
      const cardBackground = await cardWithTitle(page, fixture.todayTitle)
        .first()
        .evaluate((node) => getComputedStyle(node).backgroundColor);
      expect(cardBackground).not.toBe("rgba(0, 0, 0, 0)");

      await cardWithTitle(page, fixture.todayTitle).getByTestId("event-card-title").click();
      await expect(visibleTestId(page, "event-detail-panel")).toBeVisible({ timeout: 15_000 });
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("event-detail-panel")).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await setE2EUserTheme("alice", "theme-dark");
    }
  });

  /** §5.9 — K4: üç giriş de aynı bayrağa bakar. */
  test("`MANAGE_EVENTS` olmayan kullanıcıda üç `Oluştur` girişi de yok", async ({ page }) => {
    // `bob` tohum sunucunun düz üyesi: sahibi değil ve rol taşımıyor.
    await loginAs(page, "bob");
    await gotoAppRoute(page, "/events", EVENTS_READY);

    await expect(visibleTestId(page, "event-grid")).toBeVisible();

    // 1) Başlıktaki artı.
    await expect(page.getByTestId("events-feed-create")).toHaveCount(0);
    // 2) Ajanda rayının altındaki buton (ayak satırının kendisi de çizilmiyor).
    await expect(page.getByTestId("event-agenda-create")).toHaveCount(0);
    await expect(page.getByTestId("event-agenda-footer")).toHaveCount(0);
    // 3) Boş durumun birincil butonu — sonuçsuz bir aramada boş durum çizilir.
    await gotoAppRoute(page, "/events?q=zzzzzz-yok", EVENTS_READY);
    await expect(visibleTestId(page, "events-empty-state")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("events-empty-create")).toHaveCount(0);
  });
});
