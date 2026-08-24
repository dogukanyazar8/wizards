import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EN_MESSAGES } from "./messages/en";
import { TR_MESSAGES } from "./messages/tr";

/**
 * Etkinlikler paketinin metin sözleşmesi — `SPEC-ETKINLIKLER.md` §3–§9 ve
 * `referans/Etkinlikler-4B.dc.html` veri modeli.
 *
 * Aşağıdaki tablo tasarım kaynağından **kopyalanmıştır**. Bir cümleyi kısaltan, uzatan ya da
 * "iyileştiren" her değişiklik burada kırmızı verir.
 *
 * Genel sözlük denetimi (iki dilin anahtar kümesi, boş değer, çoğul) `messages.test.ts`
 * dosyasındadır.
 */

const TR: Record<string, string> = TR_MESSAGES;
const EN: Record<string, string> = EN_MESSAGES;

/**
 * Ş10 — Ana Sayfa Faz 6'nın liste + ay takvimi ekranı silindi ve on iki anahtarının onu
 * sözlükten düştü. Hayatta kalan ikisinin **yeni** bir tüketicisi var, o yüzden burada:
 *
 * - `events.calendar.emptyDay` → sağ ajanda rayının boş günü (`event-agenda-rail.tsx`, Ş7),
 * - `events.title` → akış başlığının varsayılan dalı (`events-feed-header.tsx`, Ş5).
 */
const LEGACY_KEYS = ["events.calendar.emptyDay", "events.title"] as const;

/**
 * Silinenler. Anahtarın kendisi kadar **yokluğu** da bir sözleşme: bir gün geri eklenirse,
 * onu çizen ekran olmadığı için sözlükte ölü metin olarak yaşardı.
 */
const REMOVED_KEYS = [
  "events.calendar.emptyMonth",
  "events.calendar.label",
  "events.calendar.nextMonth",
  "events.calendar.previousMonth",
  "events.calendar.today",
  "events.empty",
  "events.remind",
  "events.reminded",
  "events.view.calendar",
  "events.view.list",
] as const;

/** SPEC ve referans HTML'de **birebir** verilen cümleler. */
const SPEC: Record<string, string> = {
  // §3.1 başlık dalları ve sekmeler
  "events.title": "Etkinlikler",
  "events.title.live": "Canlı",
  "events.title.going": "Katılacağım",
  "events.title.search": "Arama sonuçları",
  "events.title.today": "Bugün",
  "events.tabs.all": "Tümü",
  "events.tabs.upcoming": "Yaklaşan",
  "events.tabs.live": "Canlı",
  "events.tabs.going": "Katılacağım",

  // §3.1 alt satır
  "events.sub.count": "{count} etkinlik",
  "events.sub.grouped": "Güne göre gruplu",
  "events.sub.searchResults": "“{query}” için {count} sonuç",
  "events.sub.live": "{count} canlı",
  "events.sub.going": "{count} katılım",
  "events.sub.calendarOn": "takvim bağlı",
  "events.sub.calendarOff": "takvim bağlı değil",
  "events.sub.emptyLine": "Yaklaşan etkinlik yok · filtreleri temizleyebilirsin",
  "events.sub.errorLine": "Son eşitleme {time} · yerel hatırlatmalar çalışıyor",
  "events.sub.offline": "Bağlantı yok",

  // §3.6 tür adları
  "events.kind.voice": "Sesli buluşma",
  "events.kind.meeting": "Toplantı",
  "events.kind.game": "Oyun gecesi",
  "events.kind.live": "Canlı yayın",
  "events.kind.community": "Topluluk",
  "events.kind.workshop": "Atölye",

  // §3.5 gün grupları
  "events.day.today": "Bugün",
  "events.day.tomorrow": "Yarın",
  "events.day.week": "Bu hafta",
  "events.day.past": "Geçmiş",

  // §3.2 hafta şeridi
  "events.week.previous": "Önceki hafta",
  "events.week.next": "Sonraki hafta",
  "events.week.dow.mon": "Pzt",
  "events.week.dow.tue": "Sal",
  "events.week.dow.wed": "Çar",
  "events.week.dow.thu": "Per",
  "events.week.dow.fri": "Cum",
  "events.week.dow.sat": "Cmt",
  "events.week.dow.sun": "Paz",

  // §3.3 filtre şeridi
  "events.filters.label": "AKTİF FİLTRELER",
  "events.filters.clearAll": "Tümünü temizle",
  "events.filters.mine.going": "Katılacağım",
  "events.filters.mine.maybe": "Belki",
  "events.filters.mine.host": "Sahibi olduğum",
  "events.filters.time.today": "Bugün",
  "events.filters.time.week": "Bu hafta",
  "events.filters.time.month": "Bu ay",
  "events.filters.time.past": "Geçmiş",

  // §3.4 RSVP onay şeridi
  "events.rsvp.bannerTitle": "{title} etkinliğine katılıyorsun",
  "events.rsvp.bannerSub": "{day} {time} · başlamadan {minutes} dk önce hatırlatma gönderilecek",
  "events.rsvp.addToCalendar": "Takvime ekle",

  // §3.6 kart
  "events.card.join": "Katıl",
  "events.card.joined": "Katılıyorsun",
  "events.card.maybe": "Belki",
  "events.card.live": "Canlı",
  "events.card.attendees": "{count} kişi katılıyor · {host} düzenliyor",
  "events.card.startsIn": "Başlamasına {minutes} dk",
  "events.card.sizeToggle": "Kart boyutu",

  // §3.5 akış altlığı
  "events.grid.footer": "Geçmiş etkinlikler 30 gün arşivde tutulur",

  // §4 ajanda rayı
  "events.agenda.title": "Bugün",
  "events.agenda.sub": "{date} · {count} etkinlik · {live} canlı",
  "events.agenda.goingLabel": "KATILACAĞIM",
  "events.agenda.create": "Etkinlik oluştur",

  // §5 detay paneli
  "events.detail.hostedBy": "{host} düzenliyor",
  "events.detail.description": "Açıklama",
  "events.detail.attendees": "Katılımcılar",
  "events.detail.more": "{count} kişi daha",
  "events.detail.reminderOn": "Hatırlatma açık",
  "events.detail.reminderBefore": "Başlamadan {minutes} dk önce",
  "events.detail.reminderChange": "Değiştir",
  "events.detail.joinLive": "Yayına katıl",
  "events.detail.leave": "Katılımı geri al",
  "events.detail.share": "Paylaş",
  "events.detail.role.host": "Sahibi",
  "events.detail.role.going": "Katılıyor",
  "events.detail.role.maybe": "Belki",
  "events.detail.role.listening": "Dinliyor",

  // §6 oluştur modalı
  "events.create.title": "Etkinlik oluştur",
  "events.create.subtitle": "Sunucu üyelerine bildirim gider, katılım yanıtları sayılır",
  "events.create.kindLabel": "Etkinlik türü",
  "events.create.titleLabel": "Başlık",
  "events.create.titlePlaceholder": "Örn. Tasarım Kritiği",
  "events.create.whenLabel": "Tarih ve saat",
  "events.create.durationLabel": "Süre",
  "events.create.placeLabel": "Yer",
  "events.create.public": "Topluluk keşfetinde listele",
  "events.create.publicSub": "Sunucu dışındaki kullanıcılar da görebilir ve katılabilir",
  "events.create.footerNote": "Tekrar eden etkinlikler oluşturulduktan sonra ayarlanır",
  "events.create.cancel": "İptal",
  "events.create.submit": "Oluştur",
  "events.create.duration.30": "30 dk",
  "events.create.duration.45": "45 dk",
  "events.create.duration.60": "1 sa",

  // §3.7 boş durum
  "events.empty.title": "Planlanmış etkinlik yok",
  "events.empty.body":
    "Bu filtrede yaklaşan etkinlik bulunmuyor. Sunucularından biri için etkinlik oluşturabilir ya da herkese açık topluluk etkinliklerine göz atabilirsin.",
  "events.empty.create": "Etkinlik oluştur",
  "events.empty.clearFilters": "Filtreleri temizle",

  // §3.8 hata durumu
  "events.error.title": "Etkinlikler yüklenemedi",
  "events.error.body":
    "Sunucuyla bağlantı kurulamadı. Yeniden denerken kaydedilmiş katılım yanıtların korunur; yerel hatırlatmalar çalışmaya devam eder.",
  "events.error.retry": "Yeniden dene",
  "events.error.status": "Durum sayfası",
  "events.error.code": "Hata kodu: {code} · son deneme {time}",

  // §3.1 zil
  "events.notifications.toggle": "Etkinlik bildirimleri",
};

const EVENT_KEYS = Object.keys(TR).filter((key) => key.startsWith("events."));
const NEW_KEYS = EVENT_KEYS.filter((key) => !LEGACY_KEYS.includes(key as never));

describe("Etkinlikler metin sözleşmesi", () => {
  it("SPEC'te verilen her cümle birebir aynı", () => {
    const drift = Object.entries(SPEC)
      .filter(([key, expected]) => TR[key] !== expected)
      .map(([key, expected]) => `${key}: "${TR[key] ?? "(eksik)"}" ≠ "${expected}"`);

    assert.deepEqual(drift, []);
  });

  it("her anahtarın İngilizce karşılığı var", () => {
    assert.deepEqual(
      EVENT_KEYS.filter((key) => typeof EN[key] !== "string"),
      [],
    );
  });

  it("hiçbir değer boş değil", () => {
    assert.deepEqual(
      EVENT_KEYS.filter((key) => TR[key]?.trim().length === 0 || EN[key]?.trim().length === 0),
      [],
    );
  });

  it("interpolasyon isimleri iki dilde aynı", () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort();

    assert.deepEqual(
      EVENT_KEYS.filter(
        (key) => placeholders(TR[key] ?? "").join("|") !== placeholders(EN[key] ?? "").join("|"),
      ),
      [],
    );
  });

  it("eski ekrandan devralınan iki anahtar hâlâ ayakta (yeni tüketicileri var)", () => {
    assert.deepEqual(
      LEGACY_KEYS.filter((key) => typeof TR[key] !== "string" || typeof EN[key] !== "string"),
      [],
    );
  });

  it("eski ekranın kalan on anahtarı iki sözlükten de silindi (Ş10)", () => {
    assert.deepEqual(
      REMOVED_KEYS.filter((key) => key in TR || key in EN),
      [],
    );
  });

  it("yeni aile bu dalgada eklendi", () => {
    assert.ok(NEW_KEYS.length >= 90, `yeni anahtar sayısı beklenenden az: ${NEW_KEYS.length}`);
  });

  it("üç `Oluştur` girişi aynı sözü verir (K4)", () => {
    // Başlık, ajanda rayı altı ve boş durum: `MANAGE_EVENTS` yokken üçü birden gizlenir, o
    // yüzden üçünün metni de bir gün ayrışmamalı.
    assert.equal(TR["events.header.create"], "Etkinlik oluştur");
    assert.equal(TR["events.agenda.create"], TR["events.header.create"]);
    assert.equal(TR["events.empty.create"], TR["events.header.create"]);
    assert.equal(TR["events.create.title"], TR["events.header.create"]);
  });

  it("sekme etiketi ile başlık dalı aynı sözcüğü kullanır", () => {
    assert.equal(TR["events.tabs.live"], TR["events.title.live"]);
    assert.equal(TR["events.tabs.going"], TR["events.title.going"]);
    // Sağ ray bölüm başlığı da aynı sözcüktür, yalnız büyük harfle çizilir (§4).
    assert.equal(TR["events.agenda.goingLabel"], "KATILACAĞIM");
  });

  it("tür pili metnini taşır: altı türün altısı da adlandırılmış", () => {
    // "Renk tek başına anlam taşımaz" (PROMPT §5) — her tür tonunun bir metin karşılığı var.
    for (const kind of ["voice", "meeting", "game", "live", "community", "workshop"]) {
      assert.equal(typeof TR[`events.kind.${kind}`], "string", kind);
    }
  });

  it("sunucudan metin beklemez: süre ve tekrar istemcide kurulur (§3.1 sapması)", () => {
    assert.equal(TR["events.duration.minutes"], "{minutes} dk");
    assert.equal(TR["events.duration.hours"], "{hours} sa");
    assert.equal(TR["events.duration.hoursMinutes"], "{hours} sa {minutes} dk");
    assert.equal(TR["events.duration.elapsed"], "{duration} geçti");
    assert.equal(TR["events.card.recurrence.weekly"], "Her {weekday}");
  });

  it("erişilebilirlik adları eksiksiz", () => {
    for (const surface of ["grid", "card", "tabList", "weekStrip", "agendaRail", "detailPanel"]) {
      assert.equal(typeof TR[`events.a11y.${surface}`], "string", surface);
      assert.equal(typeof EN[`events.a11y.${surface}`], "string", surface);
    }
  });
});
