import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EN_MESSAGES } from "./messages/en";
import { TR_MESSAGES } from "./messages/tr";

/**
 * Bahsedilmeler paketinin metin sözleşmesi — `SPEC-BAHSEDILMELER.md` ve
 * `referans/Bahsedilmeler.dc.html`.
 *
 * Aşağıdaki tablo tasarım kaynağından **kopyalanmıştır**. Bir cümleyi kısaltan, uzatan ya da
 * "iyileştiren" her değişiklik burada kırmızı verir; kural PROMPT §4'ün "TR karşılığı SPEC'teki
 * metnin birebir aynısı olsun" maddesidir.
 *
 * Genel sözlük denetimi (iki dilin anahtar kümesi, boş değer) `messages.test.ts` dosyasındadır.
 */

const TR: Record<string, string> = TR_MESSAGES;
const EN: Record<string, string> = EN_MESSAGES;

/**
 * Eski `/mentions` ekranının anahtarları. Dalga 2 / Ş5 `components/screens/mentions-screen.tsx`
 * dosyasını sildi ve bu dokuz anahtarın son çağıranı da onunla gitti; sözlükte durmaları
 * "hangi metin canlı" sorusunu cevapsız bırakırdı.
 */
const REMOVED_LEGACY_KEYS = [
  "mentions.empty",
  "mentions.emptyHint",
  "mentions.filter.all",
  "mentions.filter.dms",
  "mentions.filter.servers",
  "mentions.filter.unread",
  "mentions.markAllRead",
  "mentions.title",
  "mentions.unreadCount",
] as const;

/** SPEC'te birebir verilen cümleler. */
const SPEC: Record<string, string> = {
  // §3 bahsetme rayı
  "mentions.sidebar.title": "Bahsedilmeler",
  "mentions.sidebar.markAllRead": "Tümünü okundu işaretle",
  "mentions.sidebar.searchPlaceholder": "Bahsetmelerde ara",
  "mentions.sidebar.byKind": "Türe göre",
  "mentions.sidebar.bySource": "Kaynağa göre",
  "mentions.sidebar.dmSource": "Direkt mesajlar",

  // §3 tür satırları
  "mentions.kind.me.title": "Bana özel",
  "mentions.kind.role.title": "Rol bahsetmeleri",
  "mentions.kind.thread.title": "Thread yanıtları",
  "mentions.kind.thread.subtitle": "Takip ettiğin thread'ler",
  "mentions.kind.unread.title": "Okunmamış",
  "mentions.kind.unread.subtitle": "Sayaca yansıyanlar",

  // §4 sekmeler ve başlık
  "mentions.tabs.all": "Tümü",
  "mentions.tabs.unread": "Okunmamış",
  "mentions.tabs.role": "Rol · @herkes",
  "mentions.tabs.dm": "DM",
  "mentions.header.countPill": "{count} bahsetme",
  "mentions.header.allRead": "Hepsi okundu",
  "mentions.header.subtitleTime": "Zamana göre gruplu · {unread} okunmamış · en yenisi {time}",
  "mentions.header.subtitleSource": "Kaynağa göre gruplu · {unread} okunmamış · en yenisi {time}",
  "mentions.header.subtitleEmpty": "Son 30 gün · bekleyen bahsetme yok",

  // §5 gruplar ve tür pilleri
  "mentions.group.today": "Bugün",
  "mentions.group.yesterday": "Dün",
  "mentions.group.thisWeek": "Bu hafta",
  "mentions.badge.me": "Bana özel",
  "mentions.badge.role": "Rol",
  "mentions.badge.everyone": "@herkes",
  "mentions.badge.thread": "Thread",

  // §5 kart eylemleri
  "mentions.card.actions.reply": "Yanıtla",
  "mentions.card.actions.context": "Bağlamda gör",
  "mentions.card.actions.markRead": "Okundu işaretle",
  "mentions.card.actions.markUnread": "Okunmadı işaretle",
  "mentions.card.thread": "{count} yanıt · thread hâlâ açık",

  // §5.1 kart menüsü
  "mentions.card.menu.copyLink": "Mesaj bağlantısını kopyala",
  "mentions.card.menu.readLater": "Sonra oku",
  "mentions.card.menu.mute": "{channel} kanalını sessize al",
  "mentions.card.menu.muteConversation": "Bu sohbeti sessize al",
  "mentions.card.menu.remove": "Listeden kaldır",

  // §5.2 satır içi yanıt
  "mentions.reply.meta": "{author} mesajına yanıt · {source}",
  "mentions.reply.placeholder": "Yanıt yaz — kanala gönderilir",
  "mentions.reply.cancel": "Vazgeç",

  // §5.3 akış altlığı
  "mentions.feed.footer": "Daha eski bahsetmeler 30 gün sonra arşivlenir",

  // §6 bağlam paneli
  "mentions.context.title": "Bağlam",
  "mentions.context.openInChannel": "Kanalda aç",
  "mentions.context.replyInThread": "Thread'de yanıtla",

  // §7 bildirim ayarları
  "mentions.settings.title": "Bahsetme bildirimleri",
  "mentions.settings.subtitle": "Bu ayarlar tüm sunucular için geçerli",
  "mentions.settings.me.title": "Bana özel bahsetmeler",
  "mentions.settings.me.subtitle": "Adın veya kullanıcı adın yazıldığında",
  "mentions.settings.role.title": "Rol bahsetmeleri",
  "mentions.settings.role.subtitle": "@tasarım, @ürün gibi rollerde",
  "mentions.settings.everyone.title": "@herkes ve @burada",
  "mentions.settings.everyone.subtitle": "Sunucu geneline yapılan çağrılar",
  "mentions.settings.thread.title": "Thread yanıtları",
  "mentions.settings.thread.subtitle": "Takip ettiğin thread'lere gelen yanıtlar",
  "mentions.settings.desktop.label": "Masaüstü bildirimi",
  "mentions.settings.desktop.all": "Tümü",
  "mentions.settings.desktop.mentions": "Sadece bahsetmeler",
  "mentions.settings.desktop.off": "Kapalı",
  "mentions.settings.quiet.title": "Sessiz saatler açık",
  "mentions.settings.quiet.subtitle": "{from} – {to} · bahsetmeler sayaçta birikir",
  "mentions.settings.quiet.edit": "Düzenle",
  "mentions.settings.footerNote": "Kanal bazlı ayarlar kanal menüsünden yönetilir",
  "mentions.settings.cancel": "İptal",
  "mentions.settings.save": "Kaydet",

  // §8 boş durum
  "mentions.empty.title": "Bekleyen bahsetme yok",
  "mentions.empty.body":
    "Son 30 günün bahsetmelerini okudun. Yeni bir bahsetme geldiğinde burada ve gezinme panelinde sayaç olarak görünür.",
  "mentions.empty.archive": "Arşive dön",
  "mentions.empty.settings": "Bildirim ayarları",
};

const MENTION_KEYS = Object.keys(TR).filter((key) => key.startsWith("mentions."));

describe("Bahsedilmeler metin sözleşmesi", () => {
  it("SPEC'te verilen her cümle birebir aynı", () => {
    const drift = Object.entries(SPEC)
      .filter(([key, expected]) => TR[key] !== expected)
      .map(([key, expected]) => `${key}: "${TR[key] ?? "(eksik)"}" ≠ "${expected}"`);

    assert.deepEqual(drift, []);
  });

  it("her anahtarın İngilizce karşılığı var", () => {
    const missing = MENTION_KEYS.filter((key) => typeof EN[key] !== "string");

    assert.deepEqual(missing, []);
  });

  it("hiçbir değer boş değil", () => {
    const empty = MENTION_KEYS.filter(
      (key) => TR[key]?.trim().length === 0 || EN[key]?.trim().length === 0,
    );

    assert.deepEqual(empty, []);
  });

  it("interpolasyon isimleri iki dilde aynı", () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort();

    const drift = MENTION_KEYS.filter((key) => {
      const tr = placeholders(TR[key] ?? "");
      const en = placeholders(EN[key] ?? "");
      return tr.join("|") !== en.join("|");
    });

    assert.deepEqual(drift, []);
  });

  it("eski ekranın anahtarları sözlükten kaldırıldı", () => {
    const leftovers = REMOVED_LEGACY_KEYS.filter(
      (key) => typeof TR[key] === "string" || typeof EN[key] === "string",
    );

    assert.deepEqual(leftovers, []);
  });

  it("tür pili ve ray başlığı aynı sözcüğü kullanır", () => {
    assert.equal(TR["mentions.badge.me"], TR["mentions.kind.me.title"]);
    // Ray başlığı ile akış başlığı **tek** anahtardan okunur (Ş5): ekranın adı iki yerde
    // yazılıp bir gün ayrışamaz.
    assert.equal(TR["mentions.sidebar.title"], "Bahsedilmeler");
  });

  it("bildirim ayarları başlığı ray ve akış başlığındaki ipucuyla aynı", () => {
    assert.equal(TR["mentions.settings.title"], TR["mentions.sidebar.notificationSettings"]);
    assert.equal(TR["mentions.settings.title"], TR["mentions.header.notifications"]);
  });
});
