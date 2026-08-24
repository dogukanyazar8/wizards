import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EN_MESSAGES } from "./messages/en";
import { TR_MESSAGES } from "./messages/tr";

/**
 * Keşfet paketinin metin sözleşmesi — `SPEC-KESFET.md` §10 ve gövdesi.
 *
 * Aşağıdaki tablo tasarım kaynağından **kopyalanmıştır**; SPEC dosyası testte okunmaz. Bir
 * cümleyi kısaltan, uzatan ya da "iyileştiren" her değişiklik burada kırmızı verir; kural
 * PROMPT §4'ün "TR karşılığı SPEC'teki metnin birebir aynısı olsun" maddesidir.
 *
 * Genel sözlük denetimi (iki dilin anahtar kümesi, boş değer) `messages.test.ts` dosyasındadır.
 */

const TR: Record<string, string> = TR_MESSAGES;
const EN: Record<string, string> = EN_MESSAGES;

/**
 * Eski `/discover` ekranının anahtarları (K8). Ekran ve tek çağıranı Dalga 3 / Ş8'de
 * silinecek; o güne kadar sözlükte dururlar. Bu liste silme işini unutulmaz kılar: Ş8
 * anahtarları kaldırdığında bu testi `LEGACY_KEYS_PENDING_REMOVAL` yerine
 * `REMOVED_LEGACY_KEYS` kontrolüne çevirir.
 */
const REMOVED_LEGACY_KEYS = [
  "discover.emptySearch.description",
  "discover.emptySearch.title",
  "discover.emptyState.description",
  "discover.emptyState.title",
  "discover.loadingMore",
  "discover.members",
  "discover.online",
  "discover.searchLabel",
  "discover.searchPlaceholder",
  "discover.subtitle",
] as const;

/** Katılma hata yolları hâlâ geçerli; bu anahtarlar Ş8'de de kalır. */
const KEPT_LEGACY_KEYS = [
  "discover.joinError.banned.description",
  "discover.joinError.banned.title",
  "discover.joinError.full.description",
  "discover.joinError.full.title",
  "discover.joinError.generic.description",
  "discover.joinError.generic.title",
  "discover.joinError.unavailable.description",
  "discover.joinError.unavailable.title",
  "discover.joining",
] as const;

/** SPEC'te birebir verilen cümleler. */
const SPEC: Record<string, string> = {
  // §3 dizin kolonu
  "discover.title": "Keşfet",
  "discover.search.placeholder": "Sunucu, kişi veya kanal ara",
  "discover.search.clear": "Aramayı temizle",
  "discover.categories": "Kategoriler",
  "discover.category.all": "Tümü",
  "discover.category.oyun": "Oyun",
  "discover.category.is": "İş",
  "discover.category.calisma": "Çalışma",
  "discover.category.kisisel": "Kişisel",
  "discover.category.destek": "Destek",
  "discover.sort": "Sırala",
  "discover.sort.popular": "Popüler",
  "discover.sort.online": "En çok çevrimiçi",
  "discover.sort.new": "Yeni eklenenler",
  "discover.invite.title": "Davet kodun var mı?",
  "discover.invite.body": "Özel sunuculara kodla katılabilirsin.",
  "discover.invite.cta": "Kodla katıl",

  // §4.1 akış başlığı
  "discover.lanes.servers": "Sunucular",
  "discover.lanes.people": "Kişiler",
  "discover.lanes.channels": "Kanallar",
  "discover.lanes.events": "Etkinlikler",
  "discover.header.title": "Keşfet",
  "discover.header.searchResults": "Arama sonuçları",
  "discover.header.sub": "{count} sunucu · 6 kategori · {sort} sıralı",
  "discover.header.sub.empty": "0 sonuç · Dizinde eşleşme yok · filtreleri temizleyebilirsin",
  "discover.header.sub.error":
    "Bağlantı yok · Dizin eşitlemesi {time}’de kesildi · kendi sunucuların etkilenmedi",
  "discover.header.sortWord.popular": "popüler",
  "discover.header.sortWord.online": "çevrimiçi",
  "discover.header.sortWord.new": "yeni",
  "discover.header.joinServer": "Sunucuya katıl",
  "discover.header.cardSize": "Kart boyutu",

  // §4.2 öne çıkan blok
  "discover.featured": "Öne çıkan",
  "discover.featured.member": "Zaten üyesin",

  // §4.3 bölüm başlıkları
  "discover.section.servers": "TOPLULUK SUNUCULARI",
  "discover.section.servers.note.popular": "Popülerlik sırasına göre",
  "discover.section.servers.note.category": "{category} kategorisi",
  "discover.section.servers.note.search": "“{q}” için eşleşenler",
  "discover.section.people": "KİŞİ ÖNERİLERİ",
  "discover.section.people.note": "Ortak sunucu ve ilgi alanına göre",
  "discover.section.channels": "POPÜLER KANALLAR",
  "discover.section.channels.note": "Son 24 saatteki hareketliliğe göre",
  "discover.section.events": "HERKESE AÇIK ETKİNLİKLER",
  "discover.section.events.note": "Sunucu üyeliği gerekmez",
  "discover.footnote.servers":
    "Dizin her saat güncellenir · yalnızca herkese açık sunucular listelenir",
  "discover.footnote.other": "Öneriler ortak sunucu ve ilgi alanına göre hesaplanır",

  // §4.4 sunucu kartı
  "discover.card.join": "Katıl",
  "discover.card.joined": "Katıldın",
  "discover.card.preview": "Önizle",
  "discover.card.online": "{count} çevrimiçi",
  "discover.card.members": "{count} üye",

  // §4.5 kişi kartı
  "discover.person.add": "Arkadaş ekle",
  "discover.person.requested": "İstek gönderildi",
  "discover.person.openProfile": "Profili aç",
  "discover.person.mutualServers": "{count} ortak sunucu · {server}",

  // §4.6 kanal satırı
  "discover.channel.activity.busy": "Yoğun",
  "discover.channel.activity.live": "Canlı",
  "discover.channel.activity.weekly": "Haftalık",
  "discover.channel.activity.open": "Açık",
  "discover.channel.activity.new": "Yeni",
  "discover.channel.activity.official": "Resmî",
  "discover.channel.context": "{server} · {detail}",

  // §4.7 etkinlik kartı
  "discover.event.interested": "İlgileniyorum",
  "discover.event.detail": "Detay",
  "discover.event.interestedCount": "{count} kişi ilgileniyor",

  // §5 sunucu profili paneli
  "discover.profile.label": "Sunucu profili",
  "discover.profile.close": "Paneli kapat",
  "discover.profile.stats.channels": "Kanal",
  "discover.profile.stats.voiceRooms": "Sesli oda",
  "discover.profile.stats.founded": "Kuruluş",
  "discover.profile.channels": "Kanallar",
  "discover.profile.mutuals": "Tanıdıkların",
  "discover.profile.mutuals.note": "Ortak sunucularından tanıdığın kişiler burada da üye.",
  "discover.profile.role.admin": "Yönetici",
  "discover.profile.role.member": "Üye",
  "discover.profile.join": "Sunucuya katıl",
  "discover.profile.leave": "Sunucudan ayrıl",
  "discover.profile.share": "Paylaş",

  // §6 katıl modalı
  "discover.join.title": "Sunucuya katıl",
  "discover.join.close": "Kapat",
  "discover.join.subtitle": "Davet kodu, bağlantı ya da dizinden seçim",
  "discover.join.codeLabel": "Davet kodu veya bağlantı",
  "discover.join.codePlaceholder": "davet-kodu",
  "discover.join.paste": "Yapıştır",
  "discover.join.codeHelp":
    "Davetler bir kez kullanılabilir ya da süreli olabilir; sunucu sahibi belirler.",
  "discover.join.codeInvalid": "Geçerli bir davet kodu veya bağlantı gir.",
  "discover.join.clipboardDenied": "Panoya erişilemedi",
  "discover.join.orFromIndex": "veya dizinden",
  "discover.join.optionMeta": "{count} üye · {category}",
  "discover.join.visibility": "Katıldığımı arkadaşlarım görsün",
  "discover.join.visibilityHelp": "Profilinde ortak sunucu olarak listelenir",
  "discover.join.terms": "Topluluk kurallarını kabul etmiş olursun",
  "discover.join.cancel": "İptal",
  "discover.join.submit": "Katıl",

  // §2 + §4.8 katılım onay şeridi ve "Yeni" pili
  "discover.joined.banner": "{server} sunucusuna katıldın",
  "discover.joined.detail":
    "Sunucu rayına ve Sunucularım listesine eklendi · hoş geldin kanalı açıldı",
  "discover.joined.detailNoChannel": "Sunucu rayına ve Sunucularım listesine eklendi",
  "discover.joined.go": "Sunucuya git",
  "discover.joined.dismiss": "Kapat",
  "discover.new": "Yeni",

  // §4.9 boş ve hata durumu
  "discover.empty.title": "Sonuç bulunamadı",
  "discover.empty.body":
    "“{q}” için dizinde eşleşme yok. Yazımı kontrol edebilir, kategori filtresini kaldırabilir ya da davet kodun varsa doğrudan katılabilirsin.",
  "discover.empty.clearFilters": "Filtreleri temizle",
  "discover.empty.enterCode": "Davet kodu gir",
  "discover.error.title": "Dizin yüklenemedi",
  "discover.error.body":
    "Topluluk dizinine şu anda ulaşılamıyor. Kendi sunucularını kullanmaya devam edebilirsin; davet bağlantıları ve kodlar bu hatadan etkilenmez.",
  "discover.error.retry": "Yeniden dene",
  "discover.error.code": "Hata kodu: {code} · son deneme {time}",
};

const DISCOVER_KEYS = Object.keys(TR).filter((key) => key.startsWith("discover."));

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/gu)].map((match) => match[1] ?? "").sort();
}

describe("Keşfet metin sözleşmesi", () => {
  it("SPEC'te verilen her cümle birebir aynı", () => {
    const drift = Object.entries(SPEC)
      .filter(([key, expected]) => TR[key] !== expected)
      .map(([key, expected]) => `${key}: "${TR[key] ?? "(eksik)"}" ≠ "${expected}"`);

    assert.deepEqual(drift, []);
  });

  it("her anahtarın İngilizce karşılığı var", () => {
    const missing = DISCOVER_KEYS.filter((key) => typeof EN[key] !== "string");

    assert.deepEqual(missing, []);
  });

  it("hiçbir değer boş değil", () => {
    const empty = DISCOVER_KEYS.filter(
      (key) => TR[key]?.trim().length === 0 || EN[key]?.trim().length === 0,
    );

    assert.deepEqual(empty, []);
  });

  it("interpolasyon isimleri iki dilde aynı", () => {
    const drift = DISCOVER_KEYS.filter(
      (key) => placeholders(TR[key] ?? "").join("|") !== placeholders(EN[key] ?? "").join("|"),
    );

    assert.deepEqual(drift, []);
  });

  it("Türkçe metinlerde düz tırnak ve kesme işareti yok", () => {
    // Tuzak 8: tırnak U+201C/U+201D, kesme U+2019, ayırıcı U+00B7.
    const straight = DISCOVER_KEYS.filter((key) => /["']/u.test(TR[key] ?? ""));

    assert.deepEqual(straight, []);
  });

  it("ayırıcı orta nokta, tire ya da yıldız değil", () => {
    const separatorKeys = [
      "discover.header.sub",
      "discover.header.sub.empty",
      "discover.header.sub.error",
      "discover.footnote.servers",
      "discover.person.mutualServers",
      "discover.channel.context",
      "discover.join.optionMeta",
      "discover.joined.detail",
      "discover.error.code",
    ];

    const wrong = separatorKeys.filter((key) => !(TR[key] ?? "").includes("·"));

    assert.deepEqual(wrong, []);
  });
});

describe("Keşfet sözlük hijyeni", () => {
  it("ray başlığı ile akış başlığı aynı sözcüğü kullanır", () => {
    // Ekranın adı iki yerde yazılıp bir gün ayrışamaz.
    assert.equal(TR["discover.title"], TR["discover.header.title"]);
    assert.equal(EN["discover.title"], EN["discover.header.title"]);
  });

  it("panel ve modal CTA'sı aynı sözcüğü kullanır", () => {
    assert.equal(TR["discover.profile.join"], TR["discover.join.title"]);
    assert.equal(TR["discover.profile.join"], TR["discover.header.joinServer"]);
  });

  it("kart eylemi ile modal onayı aynı sözcüğü kullanır", () => {
    assert.equal(TR["discover.card.join"], TR["discover.join.submit"]);
  });

  it("bölüm etiketleri sözlükte büyük harflidir", () => {
    // CSS `text-transform:uppercase` Türkçe'de `ı → I` üretmek için `lang="tr"` ister;
    // değeri büyük harf saklamak bu tuzağı tamamen ortadan kaldırır.
    for (const key of [
      "discover.section.servers",
      "discover.section.people",
      "discover.section.channels",
      "discover.section.events",
    ]) {
      assert.equal(TR[key], TR[key]?.toLocaleUpperCase("tr"));
    }
  });

  it("eski ekran anahtarlarını kaldırır, katılma hata anahtarlarını korur", () => {
    const lingering = REMOVED_LEGACY_KEYS.filter((key) => typeof TR[key] === "string");
    const missingKept = KEPT_LEGACY_KEYS.filter((key) => typeof TR[key] !== "string");

    assert.deepEqual(lingering, []);
    assert.deepEqual(missingKept, []);
  });

  it("yeni sözlük eski anahtarların adını geri kullanmıyor", () => {
    const collisions = REMOVED_LEGACY_KEYS.filter((key) => key in SPEC);

    assert.deepEqual(collisions, []);
  });
});
