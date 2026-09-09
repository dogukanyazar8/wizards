import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * `DMConversationPage` bağlama sözleşmesi — Ş11 (Dalga 3 kapısı).
 *
 * `ConversationMoreMenu` satırlarını **her koşulda** çiziyor: `onClick` prop'u
 * `undefined` gelirse satır ekranda durur ve hiçbir şey yapmaz (`handlers` haritası
 * `conversation-more-menu.tsx:414`). Yani bir kancayı bağlamayı unutmak markup'ta
 * hiçbir iz bırakmaz — §17'nin menüsü tam takım görünür, yarısı ölüdür.
 *
 * Bu yüzden bağlama **kaynaktan** taranıyor; emsal `conversation-profile-panel.test.tsx`
 * ("dört kanca da gövdeye iletilir"). Render eden bir test aynı soruyu soramaz:
 * ölü satır ile canlı satır aynı DOM'u üretir.
 */

const SOURCE = readFileSync(new URL("./dm-conversation-page.tsx", import.meta.url), "utf8");

function menuCall(): string {
  const start = SOURCE.indexOf("<ConversationMoreMenu");

  assert.notEqual(start, -1, "sayfa §17 menüsünü hiç çizmiyor");

  const end = SOURCE.indexOf("/>", start);

  assert.notEqual(end, -1, "menü çağrısı kapanmıyor");

  return SOURCE.slice(start, end);
}

describe("DMConversationPage — §17 menü bağlaması", () => {
  /**
   * Bugün bağlı olanlar. Liste **kapalı**: bir kanca kopar ya da yeniden
   * adlandırılırsa satır sessizce ölür ve bu test onu yakalar.
   */
  it("çizilen satırların kancaları bağlı", () => {
    const call = menuCall();

    for (const prop of [
      "onAddMembers=",
      "onArchive=",
      "onClose=",
      "onMarkUnread=",
      "onOpenProfile=",
      "onSelectMuteDuration=",
      "onToggleMuteSubmenu=",
    ]) {
      assert.ok(call.includes(prop), `${prop} menüye iletilmiyor — satır ölü çizilir`);
    }
  });

  /**
   * `presence` verilmezse bileşen `offline`a düşer ve menü, başlığın yanı başında
   * çevrimiçi görünen birini `Çevrimdışı` diye tanıtır. Dönüşüm sohbet rayının
   * yardımcısından gelmeli; ikinci bir eşleme iki yüzeyi ayırırdı.
   */
  it("DM alt satırı gerçek presence okur", () => {
    const call = menuCall();

    assert.ok(call.includes("presence={toMessagesPresence("), "presence prop'u türetilmiyor");
    assert.ok(
      SOURCE.includes('from "@/lib/messages/rail-presentation"'),
      "presence eşlemesi ray yardımcısından gelmeli",
    );
  });

  /** Rol kapısı istemcinin iddiasından değil, konuşma kaydından geliyor. */
  it("rol kapısı konuşma kaydından türetilir", () => {
    assert.ok(
      SOURCE.includes('const viewerRole = activeConversation?.role ?? "MEMBER"'),
      "viewerRole konuşma kaydından okunmalı",
    );
    assert.ok(menuCall().includes("role={viewerRole}"), "menü rol kapısını almıyor");
  });
});

describe("DMConversationPage — arşivleme ve okunmadı", () => {
  /**
   * Arşivleme sohbeti raydan düşürür. Konuşma sorgusunun önbelleği hâlâ dolu
   * olduğu için `!activeConversation` yönlendirmesi tetiklenmez; çıkış eylemin
   * kendi başarı dalında yapılmalı, yoksa kullanıcı artık listede olmayan bir
   * sohbete bakmaya devam eder.
   */
  it("arşivleme başarıda `/messages`e döner", () => {
    const start = SOURCE.indexOf("const archiveConversation");
    assert.notEqual(start, -1, "arşivleme dalı yok");

    const branch = SOURCE.slice(start, start + 600);

    assert.ok(branch.includes("hideConversation(conversationId)"), "mevcut mutasyon kullanılmalı");
    assert.ok(branch.includes('router.replace("/messages")'), "arşivden sonra rota değişmeli");
    assert.ok(branch.includes("redirectedRef.current = true"), "yönlendirme bayrağı kurulmalı");
  });

  /** İki dalın da bir hata cümlesi var: sessizce başarısız olan bir satır yalan söyler. */
  it("iki eylem de hata dalında `actionFailed` basar", () => {
    for (const name of ["const markConversationUnread", "const archiveConversation"]) {
      const start = SOURCE.indexOf(name);
      assert.notEqual(start, -1, `${name} yok`);
      assert.ok(
        SOURCE.slice(start, start + 600).includes('kind: "actionFailed"'),
        `${name} hata dalında toast basmıyor`,
      );
    }
  });

  /** Okunmadı işareti mevcut mutasyondan gelir — ikinci bir sayaç otoritesi açılmaz. */
  it("okunmadı işareti ray ile aynı mutasyonu paylaşır", () => {
    assert.ok(
      SOURCE.includes("markAsUnread(conversationId)"),
      "`useDMConversations.markAsUnread` kullanılmalı",
    );
    assert.ok(
      !SOURCE.includes("markDMConversationUnreadRequest"),
      "sayfa kendi istemcisini açmamalı",
    );
  });
});
