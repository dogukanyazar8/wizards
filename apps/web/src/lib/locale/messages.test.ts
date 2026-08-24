import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EN_MESSAGES } from "./messages/en";
import { TR_MESSAGES } from "./messages/tr";

/**
 * Sözlük denetimi — `08-faz7` §1.5.
 *
 * İki dosya **aynı anahtar kümesini** taşır. Bir dilde yazılıp diğerinde unutulan anahtar
 * ekranda ham anahtar olarak görünür (`t()` bulamadığında anahtarın kendisini döner) ve
 * hiçbir test bunu fark etmez — bu dosya tam olarak onu fark eder.
 */

const TR: Record<string, string> = TR_MESSAGES;
const EN: Record<string, string> = EN_MESSAGES;

const TR_KEYS = Object.keys(TR);
const EN_KEYS = Object.keys(EN);

/** `08-faz7` §1.1/§1.2/§1.3 — bu paketin sözlüğe kattığı önekler. */
const PACKAGE_PREFIXES = ["home.", "mentions.", "events.", "inbox.", "screens.", "shell.appNav."];

function missing(from: readonly string[], inside: readonly string[]): string[] {
  const known = new Set(inside);

  return from.filter((key) => !known.has(key)).sort();
}

describe("sözlük denetimi — anahtar kümeleri", () => {
  it("tr.ts'te olup en.ts'te olmayan anahtar yok", () => {
    assert.deepEqual(missing(TR_KEYS, EN_KEYS), []);
  });

  it("en.ts'te olup tr.ts'te olmayan anahtar yok", () => {
    assert.deepEqual(missing(EN_KEYS, TR_KEYS), []);
  });

  it("hiçbir değer boş değil", () => {
    const empty = TR_KEYS.filter((key) => TR[key]?.trim() === "" || EN[key]?.trim() === "");

    assert.deepEqual(empty, []);
  });
});

describe("sözlük denetimi — çoğul biçimler", () => {
  const pluralKeys = [...new Set([...TR_KEYS, ...EN_KEYS])].filter(
    (key) => key.endsWith("_one") || key.endsWith("_other"),
  );

  it("her çoğul biçiminin taban anahtarı iki dilde de var", () => {
    const orphans = pluralKeys
      .map((key) => key.replace(/_(one|other)$/, ""))
      .filter((base) => !(base in TR) || !(base in EN));

    assert.deepEqual(orphans, []);
  });

  it("çoğul biçimi olan her anahtar `{count}` taşır", () => {
    // `resolveMessageTemplate` çoğulu **yalnız** `count` değerine bakarak seçer; `{minutes}`
    // taşıyan bir anahtara `_one` yazmak sessizce ölü bir satır bırakırdı.
    const withoutCount = pluralKeys.filter(
      (key) => !(TR[key] ?? EN[key] ?? "").includes("{count}"),
    );

    assert.deepEqual(withoutCount, []);
  });
});

describe("sözlük denetimi — 1a paketinin anahtarları", () => {
  it("paketin her anahtarı iki dosyada da var", () => {
    const packageKeys = TR_KEYS.filter((key) =>
      PACKAGE_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );

    assert.ok(packageKeys.length > 100, `paket anahtarı beklenenden az: ${packageKeys.length}`);
    assert.deepEqual(missing(packageKeys, EN_KEYS), []);
  });

  it("§1.1 tablosunun TR değerleri SPEC ile karakter karakter aynı", () => {
    // Tablo `08-faz7-i18n-a11y-kirilimlar.md` §1.1'den kopyalanmıştır. Bir metni
    // "iyileştiren" her değişiklik burada kırmızı verir (§5 tuzağı).
    const SPEC: Record<string, string> = {
      "home.awaiting.accept": "Kabul et",
      "home.awaiting.empty": "Bekleyen isteğin yok",
      "home.awaiting.inbox": "Gelen kutusu",
      "home.awaiting.new": "{count} yeni",
      "home.awaiting.reply": "Yanıtla",
      "home.awaiting.title": "Yanıt bekliyor",
      "home.continue.dmChip": "DM",
      "home.continue.empty": "Henüz bir yere uğramadın",
      "home.continue.seeAll": "Tümünü gör",
      "home.continue.title": "Kaldığın yer",
      "home.focus.pill": "Odak · {minutes} dk",
      "home.friends.all": "Tümü",
      "home.friends.empty": "Çevrimiçi arkadaşın yok",
      "home.friends.idleFor": "{minutes} dk boşta",
      "home.friends.inRoom": "{room}'da",
      "home.friends.ofTotal": "· {count} kişiden",
      "home.friends.online": "{count} çevrimiçi",
      "home.friends.title": "Arkadaşlar",
      "home.greeting.afternoon": "İyi günler, {name}",
      "home.greeting.evening": "İyi akşamlar, {name}",
      "home.greeting.morning": "Günaydın, {name}",
      "home.greeting.night": "İyi geceler, {name}",
      "home.live.empty": "Şu an açık oda yok",
      "home.live.join": "Katıl",
      "home.live.leave": "Ayrıl",
      "home.live.openRooms": "{count} oda açık",
      "home.live.speaking": "{name} konuşuyor",
      "home.live.title": "Şu an canlı",
      "home.presence.busy": "Meşgul",
      "home.presence.dnd": "Rahatsız etmeyin",
      "home.presence.dndAutoOff": "{minutes} dk sonra otomatik kapanır",
      "home.presence.elapsed": "{minutes} dk geçti",
      "home.presence.idle": "Boşta",
      "home.presence.invisible": "Görünmez",
      "home.presence.online": "Çevrimiçi",
      "home.presence.title": "Durumun",
      "home.presence.total": "{minutes} dk",
      "home.search.placeholder": "Ara veya komut çalıştır",
      "home.subline.mentions": "{count} bahsedilme",
      "home.subline.pendingReplies": "{count} yanıt",
      "home.subline.unread": "okunmadı",
      "home.subline.waiting": "seni bekliyor",
      "home.upNext.attendees": "{count} kişi katılıyor",
      "home.upNext.calendar": "Takvim",
      "home.upNext.empty": "Yaklaşan etkinlik yok",
      "home.upNext.eventCount": "{count} etkinlik",
      "home.upNext.minutesLeft": "{minutes} dk kaldı",
      "home.upNext.remind": "Hatırlat",
      "home.upNext.reminded": "Hatırlatılacak",
      "home.upNext.title": "Sıradaki",
      "home.upNext.today": "bugün",
      "home.upNext.tomorrow": "yarın",
    };

    for (const [key, value] of Object.entries(SPEC)) {
      assert.equal(TR[key], value, key);
    }
  });

  it("§1.2 navigasyon tablosunun TR değerleri SPEC ile aynı", () => {
    // Anahtar adları `shell.appNav.*` — Faz 2'de yazıldılar ve kullanıcı kararıyla korundular
    // (§1.2 `nav.*` diyor; değerler birebir aynı, ad alanı mevcut sözlüğün üç parçalı düzenine
    // uyuyor). Bağlayıcı olan metinlerdir ve tek tek burada.
    const NAV: Record<string, string> = {
      "shell.appNav.discover": "Keşfet",
      "shell.appNav.events": "Etkinlikler",
      "shell.appNav.home": "Ana Sayfa",
      "shell.appNav.mentions": "Bahsedilmeler",
      "shell.appNav.messages": "Mesajlar",
      "shell.appNav.myServers": "Sunucularım",
    };

    for (const [key, value] of Object.entries(NAV)) {
      assert.equal(TR[key], value, key);
    }
  });

  it("§2.3 sayaç etiketleri `common.*` altında ve sayıyı taşıyor", () => {
    assert.equal(TR["common.unreadMessages"], "{count} okunmamış mesaj");
    assert.equal(TR["common.unreadMentions"], "{count} okunmamış bahsedilme");
  });
});
