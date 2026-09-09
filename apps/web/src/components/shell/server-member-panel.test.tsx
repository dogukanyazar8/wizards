import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import type { MemberPanelGroup, MemberPanelRow } from "@/lib/servers/member-panel-model";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import { SETTINGS_METRICS } from "@/lib/settings/metrics";
import { ServerMemberPanelView } from "./server-member-panel";

/**
 * Ş5 — SPEC-SUNUCU §4'ün kabuğu, iki grubu ve `Davet et → Gönderildi` geçişi.
 *
 * Test **ölçünün kendisini** değil, ölçünün sözlükten geldiğini doğrular (Ş8'in düzeni);
 * sözlük ile referans HTML'in eşitliği `lib/servers/parity.test.ts` işidir.
 *
 * Görünüm kancasız olduğu için sağlayıcı ağacı yalnız `LocaleProvider`; gruplama kuralı
 * `lib/servers/member-panel-model.test.ts`te ayrıca ölçülür.
 */

const MESSAGES = getMessagesForLocale("tr");
const copy = (key: string): string => MESSAGES[key] ?? "";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      {node}
    </LocaleProvider>,
  );
}

function row(overrides: Partial<MemberPanelRow> & Pick<MemberPanelRow, "userId">): MemberPanelRow {
  return {
    avatarUrl: null,
    deafened: false,
    displayName: overrides.userId,
    presence: "ONLINE",
    roleBadge: null,
    screenSharing: false,
    subtitle: `@${overrides.userId}`,
    username: overrides.userId,
    voiceChannelName: null,
    ...overrides,
  };
}

const PRESENCE_GROUPS: readonly MemberPanelGroup[] = [
  { key: "online", rows: [row({ displayName: "Selin", userId: "selin" })] },
  {
    key: "offline",
    rows: [row({ displayName: "Kerem", presence: "OFFLINE", userId: "kerem" })],
  },
];

const VOICE_GROUPS: readonly MemberPanelGroup[] = [
  { key: "inChannel", rows: [row({ displayName: "Selin", userId: "selin" })] },
  {
    key: "notInChannel",
    rows: [
      row({ displayName: "Emre", userId: "emre" }),
      row({ displayName: "Ayça", userId: "ayca" }),
    ],
  },
];

type ViewOverrides = Partial<React.ComponentProps<typeof ServerMemberPanelView>>;

function view(overrides: ViewOverrides = {}): string {
  return render(
    <ServerMemberPanelView
      canCopyInviteLink
      content="members"
      groups={PRESENCE_GROUPS}
      invitedUserIds={new Set()}
      memberCount={24}
      onClose={() => undefined}
      onCopyInviteLink={() => undefined}
      onInviteToVoice={() => undefined}
      onQueryChange={() => undefined}
      overlay={false}
      query=""
      variant="sidebar"
      voiceParticipantCount={4}
      {...overrides}
    />,
  );
}

describe("panel kabuğu (§4)", () => {
  it("kolonu 326 çizer ve ölçüyü sözlükten alır", () => {
    const html = view();

    assert.ok(html.includes(`width:${pxToRem(SERVER_METRICS.layout.rightPanelWidth)}`));
    assert.match(html, /data-testid="server-member-panel"/u);
  });

  it("başlık boşluğunu ve kapatma düğmesini sözlükten alır", () => {
    const { rightPanel } = SERVER_METRICS;
    const html = view();

    assert.ok(
      html.includes(
        `padding:${pxToRem(rightPanel.headerPaddingTop)} ${pxToRem(
          rightPanel.headerPaddingX,
        )} ${pxToRem(rightPanel.headerPaddingBottom)}`,
      ),
    );
    assert.ok(html.includes(`height:${pxToRem(SETTINGS_METRICS.header.closeSize)}`));
    assert.ok(html.includes(`border-radius:${pxToRem(SETTINGS_METRICS.header.closeRadius)}`));
    assert.ok(html.includes(`aria-label="${copy("server.panel.close")}"`));
  });

  it("üç içerik için üç ayrı başlık yazar", () => {
    assert.match(view(), /Üyeler · 24/u);
    assert.ok(view({ content: "voice" }).includes(copy("server.panel.voice.title")));
    assert.ok(view({ content: "search" }).includes(copy("server.panel.search.title")));
  });

  it("`<1400px`te akıştan çıkıp içeriğin üstüne biner", () => {
    const html = view({ overlay: true });

    assert.match(html, /data-panel-overlay="true"/u);
    assert.ok(html.includes(`z-index:${SERVER_METRICS.layout.rightPanelOverlayZIndex}`));
    assert.equal(/data-panel-overlay/u.test(view()), false);
  });
});

describe("üye listesi (§4.1)", () => {
  it("iki grubu başlıklarıyla ve sayılarıyla çizer", () => {
    const html = view();

    assert.ok(html.includes(copy("server.panel.group.online")));
    assert.ok(html.includes(copy("server.panel.group.offline")));
    assert.match(html, /data-testid="server-member-selin"/u);
    assert.match(html, /data-testid="server-member-kerem"/u);
  });

  it("çevrimdışı satırı `.55` opaklıkla soldurur", () => {
    const html = view();
    const offlineRow = html.slice(html.indexOf('data-testid="server-member-kerem"'));

    assert.ok(offlineRow.includes(`opacity:${SERVER_METRICS.rightPanel.memberOfflineOpacity}`));
  });

  it("üye arama kutusunu yalnız üye içeriğinde çizer", () => {
    assert.match(view(), /data-testid="server-member-search"/u);
    assert.equal(/data-testid="server-member-search"/u.test(view({ content: "voice" })), false);
  });

  it("durum ikonlarını ekran okuyucuya adlandırır", () => {
    const html = view({
      groups: [
        {
          key: "online",
          rows: [
            row({ displayName: "Doğukan", screenSharing: true, userId: "dogukan" }),
            row({ deafened: true, displayName: "Mert", userId: "mert" }),
          ],
        },
      ],
    });

    assert.ok(html.includes(`aria-label="${copy("server.panel.status.screenSharing")}"`));
    assert.ok(html.includes(`aria-label="${copy("server.panel.status.deafened")}"`));
  });
});

describe("ses kanalı katılımcıları (§4.2)", () => {
  it("`N KATILDI` çipini ve iki grubu çizer", () => {
    const html = view({ content: "voice", groups: VOICE_GROUPS });

    assert.match(html, /data-testid="server-panel-joined-chip"/u);
    assert.match(html, /4 katıldı/u);
    assert.ok(html.includes(copy("server.panel.group.inChannel")));
    assert.ok(html.includes(copy("server.panel.group.notInChannel")));
  });

  it("davet düğmesi yalnız `KANALDA DEĞİL` grubundadır", () => {
    const html = view({ content: "voice", groups: VOICE_GROUPS });

    assert.equal(/data-testid="server-voice-invite-selin"/u.test(html), false);
    assert.match(html, /data-testid="server-voice-invite-emre"/u);
  });

  it("`Davet et` gönderilince `Gönderildi`ye döner ve geri alınmaz", () => {
    const idle = view({ content: "voice", groups: VOICE_GROUPS });
    const sent = view({
      content: "voice",
      groups: VOICE_GROUPS,
      invitedUserIds: new Set(["emre"]),
    });

    assert.ok(idle.includes(copy("server.panel.voice.invite")));
    assert.match(idle, /data-invite-state="idle"/u);

    const emreIndex = sent.indexOf('data-testid="server-voice-invite-emre"');
    const sentButton = sent.slice(sent.lastIndexOf("<button", emreIndex));

    assert.ok(sentButton.includes(copy("server.panel.voice.invited")));
    assert.match(sent, /data-invite-state="sent"/u);
    // Gönderilmiş düğme tıklanabilir kalmaz; ekran okuyucu da bunu duyar.
    assert.match(sentButton, /aria-disabled="true"/u);
    // Aynı anda diğer satır hâlâ davet edilebilir.
    assert.match(sent, /data-testid="server-voice-invite-ayca"/u);
  });

  it("davet düğmesinin ölçüsü sözlükten gelir", () => {
    const { rightPanel } = SERVER_METRICS;
    const html = view({ content: "voice", groups: VOICE_GROUPS });

    assert.ok(html.includes(`height:${pxToRem(rightPanel.inviteButtonHeight)}`));
    assert.ok(html.includes(`border-radius:${pxToRem(rightPanel.inviteButtonRadius)}`));
  });
});

describe("`Davet bağlantısı kopyala` yetki kapısı", () => {
  it("yetkili kullanıcıya çizilir ve ölçüsünü sözlükten alır", () => {
    const { rightPanel } = SERVER_METRICS;
    const html = view({ content: "voice", groups: VOICE_GROUPS });

    assert.match(html, /data-testid="server-panel-copy-invite"/u);
    assert.ok(html.includes(copy("server.panel.voice.copyInvite")));
    assert.ok(html.includes(`height:${pxToRem(rightPanel.copyLinkHeight)}`));
  });

  /**
   * 00 §5: yetkisi olmayana **hiç render edilmez**, pasifleştirme yeterli değil. Sunucunun
   * `Üyeler davet edebilir` ayarı kapalıyken düz üye davet bağlantısı üretemez; pasif bir
   * düğme ona olmayan bir yetkiyi vaat ederdi.
   */
  it("yetkisiz üyeye DOM'da hiç görünmez", () => {
    const html = view({
      canCopyInviteLink: false,
      content: "voice",
      groups: VOICE_GROUPS,
    });

    assert.equal(/data-testid="server-panel-copy-invite"/u.test(html), false);
    assert.equal(html.includes(copy("server.panel.voice.copyInvite")), false);
  });

  it("yazı kanalında hiç çizilmez — ayak yalnız ses içeriğinindir", () => {
    assert.equal(/data-testid="server-panel-copy-invite"/u.test(view()), false);
  });
});

describe("arama içeriği (§4.3)", () => {
  it("kabuğun içine yerleştirilir ve üye listesi çizilmez", () => {
    const html = view({
      content: "search",
      searchSlot: <div data-testid="server-panel-search-slot" />,
    });

    assert.match(html, /data-testid="server-panel-search-slot"/u);
    assert.equal(/data-testid="server-member-selin"/u.test(html), false);
  });
});
