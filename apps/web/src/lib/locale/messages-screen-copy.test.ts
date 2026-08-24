import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EN_MESSAGES } from "./messages/en";
import { TR_MESSAGES } from "./messages/tr";

/**
 * Mesajlar paketinin metin sözleşmesi — `SPEC-MESAJLAR.md` ve
 * `referans/Mesajlar.dc.html`.
 *
 * Aşağıdaki tablo tasarım kaynağından **kopyalanmıştır**. Bir cümleyi kısaltan,
 * uzatan ya da "iyileştiren" her değişiklik burada kırmızı verir; kural
 * PROMPT §5'in "TR karşılığı SPEC'teki metnin birebir aynısı olsun" maddesidir.
 *
 * Genel sözlük denetimi (iki dilin anahtar kümesi, boş değer, çoğul biçimler)
 * `messages.test.ts` dosyasındadır; burada yalnız bu paketin metinleri var.
 */

const TR: Record<string, string> = TR_MESSAGES;
const EN: Record<string, string> = EN_MESSAGES;

const MESSAGES_KEYS = Object.keys(TR).filter((key) => key.startsWith("messages."));

/** SPEC'te birebir verilen cümleler. */
const SPEC: Record<string, string> = {
  // §3 sohbet rayı
  "messages.rail.title": "Mesajlar",
  "messages.rail.newMessage": "Yeni mesaj",
  "messages.rail.searchPlaceholder": "Sohbet ara",
  "messages.rail.pinnedSection": "Sabitlenenler",
  "messages.rail.conversationsSection": "Sohbetler",

  // §4 Arkadaşlar
  "messages.friends.title": "Arkadaşlar",
  "messages.friends.onlineChip": "{count} çevrimiçi",
  "messages.friends.offlineChip": "{count} çevrimdışı",
  "messages.friends.pendingChip": "{count} bekleyen istek",
  "messages.friends.tabs.all": "Tümü",
  "messages.friends.tabs.add": "Arkadaş ekle",
  "messages.friends.tabs.pending": "Bekleyen",
  "messages.friends.tabs.blocked": "Engellenenler",
  "messages.friends.searchPlaceholder": "Arkadaş ara — isim, kullanıcı adı veya ortak sunucu",
  "messages.friends.sort.status": "Duruma göre",
  "messages.friends.section.online": "Çevrimiçi",
  "messages.friends.section.offline": "Çevrimdışı",
  "messages.friends.action.message": "Mesaj",
  "messages.friends.action.voiceCall": "Sesli ara",
  "messages.friends.action.videoCall": "Görüntülü ara",
  "messages.friends.menu.profile": "Profili gör",
  "messages.friends.menu.inviteToServer": "Sunucuya davet et",
  "messages.friends.menu.mute": "Sessize al",
  "messages.friends.menu.block": "Engelle",
  "messages.friends.menu.remove": "Arkadaşlıktan kaldır",
  "messages.friends.add.title": "Arkadaş ekle",
  "messages.friends.add.description":
    "Kullanıcı adını etiketiyle birlikte yaz. Büyük küçük harf duyarlı değil.",
  "messages.friends.add.placeholder": "kullaniciadi#1234",
  "messages.friends.add.submit": "İstek gönder",
  "messages.friends.suggestions.title": "Ortak sunuculardan öneriler",
  "messages.friends.suggestions.action": "Ekle",
  "messages.friends.pending.incoming": "Gelen istekler",
  "messages.friends.pending.outgoing": "Giden istekler",
  "messages.friends.pending.accept": "Kabul et",
  "messages.friends.pending.ignore": "Yoksay",
  "messages.friends.pending.cancel": "İsteği iptal et",
  "messages.friends.blocked.title": "Engellenenler",
  "messages.friends.blocked.unblock": "Engeli kaldır",
  "messages.friends.blocked.notice":
    "Engellediğin kişiler sana mesaj gönderemez, aramalarında görünmezsin. Ortak sunucularda mesajları gizlenir.",

  // §5 sohbet
  "messages.conversation.pinnedChip": "Sabitlendi",
  "messages.conversation.pinnedStrip.count": "{count} sabitlenen mesaj",
  "messages.conversation.pinnedStrip.seeAll": "Tümünü gör",
  "messages.conversation.dateToday": "Bugün",
  "messages.conversation.dateYesterday": "Dün",
  "messages.conversation.edited": "(düzenlendi)",
  "messages.conversation.roleAdmin": "Yönetici",
  "messages.conversation.thread.replies": "{count} yanıt",
  "messages.conversation.menu.copyText": "Metni kopyala",
  "messages.conversation.menu.edit": "Düzenle",
  "messages.conversation.menu.forward": "Mesajı ilet",
  "messages.conversation.menu.copyLink": "Bağlantıyı kopyala",
  "messages.conversation.menu.delete": "Mesajı sil",

  // §5.6 bestekar
  "messages.composer.markdownHint": "Markdown kısayolları desteklenir",
  "messages.composer.tool.bold": "Kalın",
  "messages.composer.tool.italic": "İtalik",
  "messages.composer.tool.underline": "Altı çizili",
  "messages.composer.tool.strikethrough": "Üstü çizili",
  "messages.composer.tool.bulletList": "Maddeli liste",
  "messages.composer.tool.orderedList": "Sıralı liste",
  "messages.composer.tool.quote": "Alıntı",
  "messages.composer.tool.inlineCode": "Satır içi kod",
  "messages.composer.tool.codeBlock": "Kod bloğu",

  // §5.5 anket kartı
  "messages.poll.labelSingle": "Anket · çoktan seçmeli değil",
  "messages.poll.labelMulti": "Anket · çoktan seçmeli",
  "messages.poll.voterCount": "{count} kişi oy verdi",
  "messages.poll.seeVoters": "Oy verenleri gör",

  // §6 paneller
  "messages.panel.thread.title": "Thread",
  "messages.panel.thread.alsoSend": "Ana sohbete de gönder",
  "messages.panel.search.title": "Mesajlarda ara",
  "messages.panel.search.personFilter": "Kişi: {name}",
  "messages.panel.search.dateFilter": "Tarih ekle",
  "messages.panel.search.resultCount": "{count} sonuç",

  // §7 grup modalı
  "messages.groupModal.title": "Yeni grup sohbeti",
  "messages.groupModal.pickedCount": "{count} kişi seçildi",
  "messages.groupModal.includingYou": "sen dahil",
  "messages.groupModal.name": "Grup adı",
  "messages.groupModal.description": "Açıklama",
  "messages.groupModal.color": "Grup ikonu rengi",
  "messages.groupModal.addRule": "Üye ekleme kuralı",
  "messages.groupModal.addRuleHint": "Gruba kim yeni kişi ekleyebilir",
  "messages.groupModal.addRuleEveryone": "Herkes",
  "messages.groupModal.addRuleAdmins": "Yöneticiler",
  "messages.groupModal.invite": "Davet bağlantısı izni",
  "messages.groupModal.inviteHint": "Üyeler bağlantı oluşturup paylaşabilir",
  "messages.groupModal.history": "Sohbet geçmişi görünürlüğü",
  "messages.groupModal.historyHint": "Yeni üyeler ne kadar geriye bakabilir",
  "messages.groupModal.historyAll": "Tüm geçmiş",
  "messages.groupModal.history30d": "30 gün",
  "messages.groupModal.history7d": "7 gün",
  "messages.groupModal.historyNone": "Yok",
  "messages.groupModal.back": "Geri",
  "messages.groupModal.next": "İleri",
  "messages.groupModal.submit": "Grubu oluştur",

  // §8 anket modalı
  "messages.pollModal.title": "Anket oluştur",
  "messages.pollModal.subtitle": "{name} · {count} üye oy verebilir",
  "messages.pollModal.question": "Soru",
  "messages.pollModal.options": "Seçenekler",
  "messages.pollModal.optionsMax": "en çok {count}",
  "messages.pollModal.addOption": "Seçenek ekle",
  "messages.pollModal.multi": "Çoktan seçmeli",
  "messages.pollModal.anonymous": "Anonim oylama",
  "messages.pollModal.duration": "Kapanma süresi",
  "messages.pollModal.duration1h": "1 saat",
  "messages.pollModal.duration24h": "24 saat",
  "messages.pollModal.duration3d": "3 gün",
  "messages.pollModal.footerHint": "Anket mesaj olarak gönderilir",
  "messages.pollModal.submit": "Anketi gönder",

  // §9 boş durum
  "messages.empty.title": "Kiminle konuşalım?",
  "messages.empty.newMessage": "Yeni mesaj",
  "messages.empty.newGroup": "Yeni grup sohbeti",
  "messages.empty.quickStart": "Hızlı başla:",
};

/** İkinci tablo yok: aşağıdakiler yalnız üstteki blokta gözden kaçmasın diye ayrı. */
const SPEC_STEPS_AND_THREADS: Record<string, string> = {
  "messages.groupModal.step1": "Adım 1 / 2 · Kimler olacak?",
  "messages.groupModal.step2": "Adım 2 / 2 · Grup ayarları",
  "messages.groupModal.searchPlaceholder": "Kullanıcı ara — isim veya @kullanıcıadı",
  "messages.panel.thread.placeholder": "Thread'e yanıt yaz",
  "messages.conversation.thread.open": "Thread'i aç · son yanıt {time}",
};

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();
}

describe("Mesajlar sözlüğü — kapsam", () => {
  it("paket beklenen büyüklükte", () => {
    assert.ok(MESSAGES_KEYS.length > 200, `paket anahtarı beklenenden az: ${MESSAGES_KEYS.length}`);
  });

  it("her anahtar iki dilde de var", () => {
    const missingEn = MESSAGES_KEYS.filter((key) => !(key in EN));

    assert.deepEqual(missingEn, []);
  });

  it("hiçbir değer boş değil", () => {
    const empty = MESSAGES_KEYS.filter((key) => TR[key]?.trim() === "" || EN[key]?.trim() === "");

    assert.deepEqual(empty, []);
  });
});

describe("Mesajlar sözlüğü — SPEC birebirliği", () => {
  it("SPEC'te verilen cümleler karakter karakter aynı", () => {
    for (const [key, value] of Object.entries(SPEC)) {
      assert.equal(TR[key], value, key);
    }
  });

  it("adım etiketleri ve thread cümleleri de aynı", () => {
    for (const [key, value] of Object.entries(SPEC_STEPS_AND_THREADS)) {
      assert.equal(TR[key], value, key);
    }
  });

  /**
   * SPEC iki cümlede 250'yi yazıyla veriyor. Sözlük sayıyı `{count}` ile alır,
   * çünkü tavanın kaynağı `GROUP_DM_MAX_PARTICIPANTS`'tır ve metne gömülen bir
   * kopya sabit değiştiğinde sessizce yalan söylerdi. Doğrulanan şey çıktıdır.
   */
  it("tavan taşıyan iki cümle 250 ile SPEC metnini verir", () => {
    assert.equal(
      TR["messages.empty.description"]?.replace("{count}", "250"),
      "Soldan bir sohbet seç ya da yeni bir tane başlat. Grup sohbetlerinde 250 kişiye kadar ekip kurabilirsin.",
    );
    assert.equal(
      TR["messages.groupModal.footerHint"]?.replace("{count}", "250"),
      "En az 2 kişi seç · en çok 250 üye",
    );
  });
});

describe("Mesajlar sözlüğü — yer tutucular", () => {
  it("iki dilde aynı yer tutucuları taşır", () => {
    const drifted = MESSAGES_KEYS.filter(
      (key) => placeholders(TR[key] ?? "").join(",") !== placeholders(EN[key] ?? "").join(","),
    );

    assert.deepEqual(drifted, []);
  });

  it("sayaç taşıyan anahtarlar `{count}` kullanır", () => {
    // `resolveMessageTemplate` çoğulu yalnız `count` değerine bakarak seçer;
    // başka bir ad ileride sessizce ölü bir çoğul biçimi bırakırdı.
    const counters = MESSAGES_KEYS.filter((key) => placeholders(TR[key] ?? "").includes("count"));

    assert.ok(counters.length > 10, `sayaç taşıyan anahtar beklenenden az: ${counters.length}`);
  });
});
