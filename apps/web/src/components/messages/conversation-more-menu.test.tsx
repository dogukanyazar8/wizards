import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DMParticipantRole } from "@wizards/types";

import {
  ConversationMoreMenu,
  PROFILE_TAB_ACTIONS,
  buildDmMenuEntries,
  buildGroupMenuEntries,
  canClearGroupHistory,
  canDeleteGroup,
  collapseSeparators,
  type ConversationMoreMenuEntry,
} from "@/components/messages/conversation-more-menu";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

const { moreMenu } = MESSAGES_METRICS;

function render(overrides: Partial<React.ComponentProps<typeof ConversationMoreMenu>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <ConversationMoreMenu
        handle="selin"
        name="Selin Aksoy"
        onClose={() => undefined}
        onOpenProfile={() => undefined}
        onSelectMuteDuration={() => undefined}
        onToggleMuteSubmenu={() => undefined}
        open
        presence="online"
        variant="dm"
        {...overrides}
      />
    </LocaleProvider>,
  );
}

function actions(entries: readonly ConversationMoreMenuEntry[]): readonly string[] {
  return entries.map((entry) => (entry.kind === "row" ? entry.action : entry.kind));
}

/** Bir `data-testid` etrafındaki işaretleme parçası — nitelik sırasına bağlanmamak için. */
function around(markup: string, testId: string): string {
  const index = markup.indexOf(`data-testid="${testId}"`);

  assert.notEqual(index, -1, `bulunamadı: ${testId}`);

  return markup.slice(Math.max(0, index - 300), index + 300);
}

describe("başlık menüsü — kabuk (SPEC §17)", () => {
  it("DM 254, grup 262 genişlikte", () => {
    assert.ok(render().includes(`width:${pxToRem(moreMenu.dmWidth)}`));
    assert.ok(
      render({ memberCount: 5, name: "Sürüm 2.4 Ekibi", variant: "group" }).includes(
        `width:${pxToRem(moreMenu.groupWidth)}`,
      ),
    );
  });

  it("tetikleyicinin altına, sağ kenarına hizalı oturur", () => {
    const markup = render();

    assert.ok(markup.includes(`top:${pxToRem(moreMenu.top)}`));
    assert.ok(markup.includes("right:0"));
    assert.ok(markup.includes(`border-radius:${pxToRem(moreMenu.radius)}`));
    assert.ok(markup.includes(`padding:${pxToRem(moreMenu.padding)}`));
  });

  it("kapalıyken hiç çizilmez", () => {
    assert.equal(render({ open: false }), "");
  });

  it('`role="menu"` ve gezilebilir satırlar taşır', () => {
    const markup = render();

    assert.match(markup, /role="menu"/);
    assert.equal(markup.match(/role="menuitem"/g)?.length, buildDmMenuEntries().length - 1);
  });

  it("DM başlığı `@kullanıcı · durum` yazar", () => {
    assert.ok(render().includes("@selin · Çevrimiçi"));
  });

  it("başlık bloğu erişilebilirlik ağacının dışında — `menu` yalnız öğe taşır", () => {
    // WAI-ARIA: `role="menu"` altında yalnız menü öğesi/grup/ayırıcı olabilir; avatarın `img`
    // rolü axe'te `aria-required-children` ihlaliydi. Başlık görsel özettir, ad sayfa başlığında.
    assert.match(
      render(),
      /<div aria-hidden="true"[^>]*data-testid="conversation-more-menu-header"/,
    );
    assert.match(
      render({ memberCount: 5, name: "Sürüm 2.4 Ekibi", variant: "group" }),
      /<div aria-hidden="true"[^>]*data-testid="conversation-more-menu-header"/,
    );
  });

  it("grup başlığı `{n} üye · {rol}` yazar", () => {
    const markup = render({
      memberCount: 5,
      name: "Sürüm 2.4 Ekibi",
      role: "ADMIN",
      variant: "group",
    });

    assert.ok(markup.includes("5 üye · Yönetici"));
  });
});

describe("DM listesi (SPEC §17)", () => {
  it("SPEC sırasını çizer", () => {
    assert.deepEqual(actions(buildDmMenuEntries()), [
      "viewProfile",
      "mute",
      "markUnread",
      "archive",
      "separator",
      "block",
      "report",
    ]);
  });

  it("SPEC metinlerini basar", () => {
    const markup = render();

    for (const label of [
      "Profili görüntüle",
      "Sessize al",
      "Okunmadı olarak işaretle",
      "Arşivle",
      "Kullanıcıyı engelle",
      "Bildir",
    ]) {
      assert.ok(markup.includes(label), label);
    }
  });

  /**
   * Üründe sohbet başına döküm üreten bir uç yok; satır pasif çizilmez, **çizilmez**.
   * Kanca verildiği gün aynı satır aynı yerde geri gelir.
   */
  it("`Sohbeti dışa aktar` karşılığı olmadan çizilmez", () => {
    const markup = render();

    assert.ok(!markup.includes("Sohbeti dışa aktar"));
    assert.ok(!actions(buildDmMenuEntries()).includes("export"));
    assert.equal(markup.match(/role="separator"/g)?.length, 1);
  });

  it("kanca verildiğinde satır ve ikinci ayırıcı geri gelir", () => {
    const markup = render({ onExportConversation: () => undefined });

    assert.ok(markup.includes("Sohbeti dışa aktar"));
    assert.deepEqual(actions(buildDmMenuEntries({ exportEnabled: true })), [
      "viewProfile",
      "mute",
      "markUnread",
      "archive",
      "separator",
      "export",
      "separator",
      "block",
      "report",
    ]);
  });

  it("grup satırları 1:1'de çizilmez", () => {
    const markup = render();

    assert.ok(!markup.includes("Gruptan ayrıl"));
    assert.ok(!markup.includes("Geçmişi temizle"));
    assert.ok(!markup.includes("Üye ekle · davet bağlantısı"));
  });
});

describe("grup listesi ve rol kapısı", () => {
  function groupEntries(role: DMParticipantRole) {
    return actions(buildGroupMenuEntries({ memberCount: 5, pinnedCount: 2, role }));
  }

  it("SPEC sırasını çizer", () => {
    assert.deepEqual(groupEntries("OWNER"), [
      "groupProfile",
      "viewMembers",
      "addMembers",
      "pinnedMessages",
      "sharedMedia",
      "mute",
      "notificationSettings",
      "section",
      "editGroup",
      "clearHistory",
      "separator",
      "leaveGroup",
      "deleteGroup",
    ]);
  });

  /** Yetkisiz satır pasif bırakılmaz; sunucu zaten 403 verir. */
  it("üye rolünde `Geçmişi temizle`, `Grubu sil` ve `YÖNETİM` yok", () => {
    const entries = groupEntries("MEMBER");

    assert.ok(!entries.includes("clearHistory"));
    assert.ok(!entries.includes("deleteGroup"));
    assert.ok(!entries.includes("section"));

    const markup = render({
      memberCount: 5,
      name: "Sürüm 2.4 Ekibi",
      role: "MEMBER",
      variant: "group",
    });

    assert.ok(!markup.includes("Geçmişi temizle"));
    assert.ok(!markup.includes("Grubu sil"));
    assert.ok(!markup.includes("Yönetim"));
    assert.ok(markup.includes("Gruptan ayrıl"));
  });

  /** Ş2 kararı: silme yalnız sahibin; sunucu `ADMIN`'e 403 veriyor. */
  it("yöneticide `Geçmişi temizle` var, `Grubu sil` yok", () => {
    const entries = groupEntries("ADMIN");

    assert.ok(entries.includes("clearHistory"));
    assert.ok(entries.includes("section"));
    assert.ok(!entries.includes("deleteGroup"));

    const markup = render({
      memberCount: 5,
      name: "Sürüm 2.4 Ekibi",
      role: "ADMIN",
      variant: "group",
    });

    assert.ok(markup.includes("Geçmişi temizle"));
    assert.ok(!markup.includes("Grubu sil"));
  });

  it("rol kapıları saf fonksiyonlarda", () => {
    assert.equal(canClearGroupHistory("OWNER"), true);
    assert.equal(canClearGroupHistory("ADMIN"), true);
    assert.equal(canClearGroupHistory("MEMBER"), false);
    assert.equal(canDeleteGroup("OWNER"), true);
    assert.equal(canDeleteGroup("ADMIN"), false);
    assert.equal(canDeleteGroup("MEMBER"), false);
  });

  /** Sayaçlar veriden; `dc.html`in `5` ve `2`si örnek veriydi, sabit değil. */
  it("sayaçlar gerçek veriden gelir", () => {
    const markup = render({
      memberCount: 12,
      name: "Sürüm 2.4 Ekibi",
      pinnedCount: 3,
      role: "OWNER",
      variant: "group",
    });

    assert.ok(around(markup, "conversation-more-menu-viewMembers-count").includes(">12<"));
    assert.ok(around(markup, "conversation-more-menu-pinnedMessages-count").includes(">3<"));
  });

  it("sayaç yoksa satır sayaçsız çizilir", () => {
    const entries = buildGroupMenuEntries({ role: "MEMBER" });
    const members = entries.find((entry) => entry.kind === "row" && entry.action === "viewMembers");

    assert.ok(members?.kind === "row" && members.count === undefined);
    assert.ok(
      !render({ name: "Sürüm 2.4 Ekibi", role: "MEMBER", variant: "group" }).includes(
        "conversation-more-menu-viewMembers-count",
      ),
    );
  });
});

describe("menüden profil paneline giden satırlar (SPEC §10)", () => {
  it("dört satır dört sekmeyi adlandırır", () => {
    assert.equal(PROFILE_TAB_ACTIONS.groupProfile, "genel");
    assert.equal(PROFILE_TAB_ACTIONS.viewMembers, "uyeler");
    assert.equal(PROFILE_TAB_ACTIONS.sharedMedia, "medya");
    assert.equal(PROFILE_TAB_ACTIONS.notificationSettings, "ayarlar");
    assert.equal(PROFILE_TAB_ACTIONS.viewProfile, "genel");
  });

  it("her eşleme grup listesinde gerçekten bir satır", () => {
    const entries = actions(buildGroupMenuEntries({ role: "OWNER" }));

    for (const action of ["groupProfile", "viewMembers", "sharedMedia", "notificationSettings"]) {
      assert.ok(entries.includes(action), action);
    }
  });
});

describe("alt menü ana menünün içinde", () => {
  it("kapalıyken liste çizilmez, ok dönmez", () => {
    const markup = render();

    assert.ok(!markup.includes('data-testid="mute-submenu"'));
    assert.ok(markup.includes("rotate(0deg)"));
  });

  it("açıkken liste çizilir ve ok 90° döner", () => {
    const markup = render({ muteSubmenuOpen: true });

    assert.ok(markup.includes('data-testid="mute-submenu"'));
    assert.ok(markup.includes(`rotate(${moreMenu.submenuChevronRotation}deg)`));
    assert.match(markup, /aria-expanded="true"/);
  });

  it("yürürlükteki süre alt menüde seçili görünür", () => {
    const markup = render({ muteDuration: "1h", muteSubmenuOpen: true });

    assert.ok(around(markup, "mute-submenu-1h").includes('aria-checked="true"'));
  });
});

describe("collapseSeparators", () => {
  it("art arda düşen ayırıcıları teke indirir", () => {
    assert.deepEqual(
      actions(
        collapseSeparators([
          { action: "archive", kind: "row" },
          { kind: "separator" },
          { kind: "separator" },
          { action: "block", kind: "row" },
        ]),
      ),
      ["archive", "separator", "block"],
    );
  });

  it("baştaki ve sondaki ayırıcıyı atar", () => {
    assert.deepEqual(
      actions(
        collapseSeparators([
          { kind: "separator" },
          { action: "archive", kind: "row" },
          { kind: "separator" },
        ]),
      ),
      ["archive"],
    );
  });

  /** Bölüm etiketi bir satır değil: ondan sonra gelen ayırıcı neyi ayırdığını söylemez. */
  it("bölüm etiketinden hemen sonraki ayırıcıyı atar", () => {
    assert.deepEqual(
      actions(
        collapseSeparators([
          { action: "archive", kind: "row" },
          { kind: "section" },
          { kind: "separator" },
          { action: "block", kind: "row" },
        ]),
      ),
      ["archive", "section", "block"],
    );
  });
});
