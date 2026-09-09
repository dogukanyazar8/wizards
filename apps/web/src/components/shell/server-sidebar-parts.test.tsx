import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { EN_MESSAGES } from "@/lib/locale/messages/en";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import { ChannelItem } from "./channel-item";
import {
  ChannelSearchPopover,
  ChannelSearchTrigger,
  type ChannelSearchHit,
} from "./channel-search-popover";
import { ConnectedVoiceStrip, resolveVoiceStripLitBars } from "./connected-voice-strip";
import { ServerMenu, SERVER_MENU_ROWS, buildServerMenuRows } from "./server-menu";

/**
 * Ş4'ün kenar çubuğu parçaları — SPEC-SUNUCU §2.
 *
 * Beklenen ölçüler `SERVER_METRICS`'ten okunuyor: aranan şey sayının doğruluğu değil
 * (onu `lib/servers/parity.test.ts` referans HTML'e karşı kilitliyor), bileşenin kendi
 * sayısını **yazmamış** olması.
 *
 * Yetki kapısının negatif testi (`buildServerMenuRows`) hem saf fonksiyonda hem çizilen
 * DOM'da koşuyor: 00 §5 "hiç render edilmez" diyor ve bunu ancak markup kanıtlar.
 */

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="en" initialMessages={EN_MESSAGES}>
      {node}
    </LocaleProvider>,
  );
}

function triggerRef() {
  return React.createRef<HTMLButtonElement>();
}

describe("ServerMenu — SPEC §2.2", () => {
  it("tam olarak beş satır ve SPEC'in sırası", () => {
    assert.deepEqual(
      SERVER_MENU_ROWS.map((row) => row.key),
      ["invite", "createCategory", "createChannel", "settings", "leave"],
    );
  });

  it("yöneticiye beş satırın hepsi çizilir", () => {
    const html = render(
      <ServerMenu
        canManageChannels
        canManageServer
        inviteHint="7 days"
        onClose={() => undefined}
        onSelect={() => undefined}
        triggerRef={triggerRef()}
      />,
    );

    for (const key of ["invite", "createCategory", "createChannel", "settings", "leave"]) {
      assert.ok(html.includes(`data-testid="server-menu-${key}"`), key);
    }
  });

  it("yetkisiz üyede üç satır **hiç üretilmez** (negatif test)", () => {
    const rows = buildServerMenuRows({ canManageChannels: false, canManageServer: false });

    assert.deepEqual(
      rows.map((row) => row.key),
      ["invite", "leave"],
    );
  });

  it("yetkisiz üyenin DOM'unda üç satır yok — gizlenmiş de değil", () => {
    const html = render(
      <ServerMenu
        canManageChannels={false}
        canManageServer={false}
        inviteHint="7 days"
        onClose={() => undefined}
        onSelect={() => undefined}
        triggerRef={triggerRef()}
      />,
    );

    for (const key of ["createCategory", "createChannel", "settings"]) {
      assert.ok(!html.includes(`server-menu-${key}`), `${key} DOM'da kalmış`);
    }

    assert.ok(html.includes('data-testid="server-menu-invite"'));
    assert.ok(html.includes('data-testid="server-menu-leave"'));
  });

  it("kanal yetkisi olan ama sunucu yetkisi olmayan üyede ayarlar satırı yok", () => {
    const rows = buildServerMenuRows({ canManageChannels: true, canManageServer: false });

    assert.deepEqual(
      rows.map((row) => row.key),
      ["invite", "createCategory", "createChannel", "leave"],
    );
  });

  it("`role=menu` + `role=menuitem` taşır", () => {
    const html = render(
      <ServerMenu
        canManageChannels
        canManageServer
        inviteHint="7 days"
        onClose={() => undefined}
        onSelect={() => undefined}
        triggerRef={triggerRef()}
      />,
    );

    assert.match(html, /role="menu"/u);
    assert.match(html, /role="menuitem"/u);
  });

  it("ölçüsünü sözlükten alır — üst 70, yarıçap 16, satır 9×10", () => {
    const { sidebar } = SERVER_METRICS;
    const html = render(
      <ServerMenu
        canManageChannels
        canManageServer
        inviteHint="7 days"
        onClose={() => undefined}
        onSelect={() => undefined}
        triggerRef={triggerRef()}
      />,
    );

    assert.ok(html.includes(`top:${pxToRem(sidebar.menuTop)}`));
    assert.ok(html.includes(`border-radius:${pxToRem(sidebar.menuRadius)}`));
    assert.ok(
      html.includes(
        `padding:${pxToRem(sidebar.menuRowPaddingY)} ${pxToRem(sidebar.menuRowPaddingX)}`,
      ),
    );
  });

  it("davet satırı ipucunu çizer, diğerleri çizmez", () => {
    const html = render(
      <ServerMenu
        canManageChannels
        canManageServer
        inviteHint="7 days"
        onClose={() => undefined}
        onSelect={() => undefined}
        triggerRef={triggerRef()}
      />,
    );

    assert.equal(html.split("7 days").length - 1, 1);
  });
});

describe("Kanal arama — SPEC §2.3", () => {
  const HITS: ChannelSearchHit[] = [
    { categoryLabel: "PAYCORE", id: "c1", name: "surum-notlari", type: "TEXT" },
    { categoryLabel: "MAESTRO", id: "c2", name: "surum-plani", type: "TEXT" },
    { categoryLabel: "LOBBY", id: "c3", name: "Genel Sohbet", type: "VOICE" },
  ];

  it("tetikleyici gerçek bir düğmedir ve komut paleti kısayolunu sahiplenmez", () => {
    const html = render(
      <ChannelSearchTrigger onOpen={() => undefined} open={false} triggerRef={triggerRef()} />,
    );

    assert.ok(html.includes('data-testid="channel-search-trigger"'));
    assert.ok(!html.includes("⌘K"));
    assert.ok(!html.includes("Ctrl+K"));
    assert.ok(html.includes('aria-expanded="false"'));
  });

  it("tetikleyicinin ölçüsü sözlükten — 8×10, yarıçap 12", () => {
    const { sidebar } = SERVER_METRICS;
    const html = render(
      <ChannelSearchTrigger onOpen={() => undefined} open={false} triggerRef={triggerRef()} />,
    );

    assert.ok(
      html.includes(
        `padding:${pxToRem(sidebar.searchButtonPaddingY)} ${pxToRem(sidebar.searchButtonPaddingX)}`,
      ),
    );
    assert.ok(html.includes(`border-radius:${pxToRem(sidebar.searchButtonRadius)}`));
  });

  it("popover `top:114` konumunda ve sonuç sayısını yazar", () => {
    const { sidebar } = SERVER_METRICS;
    const html = render(
      <ChannelSearchPopover
        channels={HITS}
        onClose={() => undefined}
        onSelect={() => undefined}
        triggerRef={triggerRef()}
      />,
    );

    assert.ok(html.includes(`top:${pxToRem(sidebar.searchPopoverTop)}`));
    assert.ok(html.includes("Channels · 3 results"));
    assert.ok(html.includes("ESC"));
  });

  it("üç sonucun üçünü de satır olarak çizer", () => {
    const html = render(
      <ChannelSearchPopover
        channels={HITS}
        onClose={() => undefined}
        onSelect={() => undefined}
        triggerRef={triggerRef()}
      />,
    );

    for (const hit of HITS) {
      assert.ok(html.includes(`data-testid="channel-search-hit-${hit.id}"`), hit.id);
      assert.ok(html.includes(hit.categoryLabel), hit.categoryLabel);
    }
  });

  it("boş sonuç kümesinde boş durum satırı çizilir", () => {
    const html = render(
      <ChannelSearchPopover
        channels={[]}
        onClose={() => undefined}
        onSelect={() => undefined}
        triggerRef={triggerRef()}
      />,
    );

    assert.ok(html.includes('data-testid="channel-search-empty"'));
  });
});

describe("Bağlı ses şeridi — SPEC §2.5", () => {
  it("ölçüsünü sözlükten alır — 10×11, yarıçap 14, ayrılma 26", () => {
    const { voiceStrip } = SERVER_METRICS;
    const html = render(
      <ConnectedVoiceStrip
        channelName="Genel Sohbet"
        latencyMs={32}
        level={0.7}
        onLeave={() => undefined}
        serverName="Mobile Test"
      />,
    );

    assert.ok(
      html.includes(`padding:${pxToRem(voiceStrip.paddingY)} ${pxToRem(voiceStrip.paddingX)}`),
    );
    assert.ok(html.includes(`border-radius:${pxToRem(voiceStrip.radius)}`));
    assert.ok(html.includes(`width:${pxToRem(voiceStrip.leaveButtonSize)}`));
  });

  it("gecikme varsa `sunucu · N ms`, yoksa yalnız sunucu adı", () => {
    const withLatency = render(
      <ConnectedVoiceStrip
        channelName="Genel Sohbet"
        latencyMs={32}
        level={0.7}
        onLeave={() => undefined}
        serverName="Mobile Test"
      />,
    );
    const withoutLatency = render(
      <ConnectedVoiceStrip
        channelName="Genel Sohbet"
        latencyMs={null}
        level={0.7}
        onLeave={() => undefined}
        serverName="Mobile Test"
      />,
    );

    assert.ok(withLatency.includes("Mobile Test · 32 ms"));
    assert.ok(!withoutLatency.includes("Mobile Test ·"));
    assert.ok(withoutLatency.includes("Mobile Test"));
  });

  it("dört çubuk çizilir ve sönük olanı düşük opaklıkta", () => {
    const { voiceStrip } = SERVER_METRICS;
    const html = render(
      <ConnectedVoiceStrip
        channelName="Genel Sohbet"
        latencyMs={null}
        level={0.6}
        onLeave={() => undefined}
        serverName="Mobile Test"
      />,
    );

    for (const barHeight of voiceStrip.barHeights) {
      assert.ok(html.includes(`height:${pxToRem(barHeight)}`), `${barHeight} yok`);
    }

    assert.ok(html.includes(`hsl(var(--success) / ${voiceStrip.barIdleAlpha})`));
  });

  it("`prefers-reduced-motion` altında çubuk sayısı seviyeden bağımsız donar", () => {
    assert.equal(resolveVoiceStripLitBars(0.05, true), 3);
    assert.equal(resolveVoiceStripLitBars(1, true), 3);
    assert.equal(resolveVoiceStripLitBars(0, false), 1);
    assert.equal(resolveVoiceStripLitBars(1, false), 4);
  });
});

describe("Kanal satırı — SPEC §2.4", () => {
  const baseProps = {
    onSelect: () => undefined,
  };

  it("satır ölçüsü sözlükten — 7×9, yarıçap 11, ikon 17", () => {
    const { sidebar } = SERVER_METRICS;
    const html = render(<ChannelItem {...baseProps} active={false} name="karsilama" type="TEXT" />);

    assert.ok(
      html.includes(
        `padding:${pxToRem(sidebar.channelRowPaddingY)} ${pxToRem(sidebar.channelRowPaddingX)}`,
      ),
    );
    assert.ok(html.includes(`border-radius:${pxToRem(sidebar.channelRowRadius)}`));
    assert.ok(html.includes(`width:${pxToRem(sidebar.channelIconSize)}`));
  });

  it("aktif satır primary/.14 zemin ve sol şeridi taşır", () => {
    const { sidebar } = SERVER_METRICS;
    const html = render(<ChannelItem {...baseProps} active name="surum-notlari" type="TEXT" />);

    assert.ok(html.includes(`hsl(var(--primary) / ${sidebar.channelActiveBackgroundAlpha})`));
    assert.ok(html.includes(`left:${pxToRem(sidebar.channelActiveStripeLeft)}`));
    assert.ok(html.includes(`width:${pxToRem(sidebar.channelActiveStripeWidth)}`));
  });

  it("okunmamış rozeti 19×18 danger ve okunabilir etiket taşır", () => {
    const { sidebar } = SERVER_METRICS;
    const html = render(
      <ChannelItem
        {...baseProps}
        active={false}
        name="build-durumu"
        type="TEXT"
        unreadCount={12}
      />,
    );

    assert.ok(html.includes(`min-width:${pxToRem(sidebar.channelUnreadMinWidth)}`));
    assert.ok(html.includes(`height:${pxToRem(sidebar.channelUnreadHeight)}`));
    assert.ok(html.includes("background:hsl(var(--danger))"));
    assert.ok(html.includes('aria-label="12 unread messages"'));
  });

  it("erişimi olmayan kanal kilit ikonuyla çizilir ve düğme devre dışıdır", () => {
    const html = render(
      <ChannelItem {...baseProps} active={false} canAccess={false} name="duyurular" type="TEXT" />,
    );

    assert.ok(html.includes("disabled"));
    assert.ok(html.includes('aria-label="Locked"'));
  });

  it("ses kanalı sayacı success tonunda ve okunabilir", () => {
    const html = render(
      <ChannelItem
        {...baseProps}
        active={false}
        name="Tasarım Kritiği"
        type="VOICE"
        voiceState={{
          channelId: "v1",
          participants: [
            {
              avatarUrl: null,
              displayName: "Selin Aksoy",
              isDeafened: false,
              userId: "u1",
              username: "selin",
            },
            {
              avatarUrl: null,
              displayName: "Mert Kaya",
              isDeafened: true,
              userId: "u2",
              username: "mert",
            },
          ],
        }}
      />,
    );

    assert.ok(html.includes("color:hsl(var(--success))"));
    assert.ok(html.includes('aria-label="2 in voice"'));
  });

  it("konuşan katılımcı halka + ekran okuyucu metni alır, susturulmuş ikon alır", () => {
    const { sidebar } = SERVER_METRICS;
    const html = render(
      <ChannelItem
        {...baseProps}
        active={false}
        mutedUserIds={new Set(["u2"])}
        name="Genel Sohbet"
        speakingUserIds={new Set(["u1"])}
        type="VOICE"
        voiceState={{
          channelId: "v1",
          participants: [
            {
              avatarUrl: null,
              displayName: "Selin Aksoy",
              isDeafened: false,
              userId: "u1",
              username: "selin",
            },
            {
              avatarUrl: null,
              displayName: "Mert Kaya",
              isDeafened: false,
              userId: "u2",
              username: "mert",
            },
          ],
        }}
      />,
    );

    assert.ok(
      html.includes(`0 0 0 ${pxToRem(sidebar.participantSpeakingRingWidth)} hsl(var(--success))`),
    );
    assert.ok(html.includes("Selin Aksoy is speaking"));
    assert.ok(html.includes('aria-label="Mert Kaya is muted"'));
  });

  it("ekran paylaşan katılımcı `CANLI` çipi alır", () => {
    const html = render(
      <ChannelItem
        {...baseProps}
        active={false}
        name="Genel Sohbet"
        type="VOICE"
        voiceState={{
          channelId: "v1",
          participants: [
            {
              avatarUrl: null,
              displayName: "Doğukan Yazar",
              isDeafened: false,
              isScreenSharing: true,
              userId: "u3",
              username: "dogukan",
            },
          ],
        }}
      />,
    );

    assert.ok(html.includes('data-testid="voice-sidebar-screen-share-dogukan"'));
    assert.ok(html.includes("LIVE"));
  });

  it("katılımcı satırı `4px 9px 4px 26px` boşluğunu sözlükten alır", () => {
    const { sidebar } = SERVER_METRICS;
    const html = render(
      <ChannelItem
        {...baseProps}
        active={false}
        name="Genel Sohbet"
        type="VOICE"
        voiceState={{
          channelId: "v1",
          participants: [
            {
              avatarUrl: null,
              displayName: "Berk Eren",
              isDeafened: false,
              userId: "u4",
              username: "berk",
            },
          ],
        }}
      />,
    );

    assert.ok(
      html.includes(
        `padding:${pxToRem(sidebar.participantPaddingY)} ${pxToRem(
          sidebar.participantPaddingRight,
        )} ${pxToRem(sidebar.participantPaddingY)} ${pxToRem(sidebar.participantPaddingLeft)}`,
      ),
    );
    assert.ok(html.includes(`width:${pxToRem(sidebar.participantAvatarSize)}`));
  });

  it("satırda yönetici kaplaması yok — referansta kalem/çöp bulunmuyor", () => {
    const html = render(<ChannelItem {...baseProps} active={false} name="karsilama" type="TEXT" />);

    assert.ok(!html.includes("data-channel-edit-name"));
    assert.ok(!html.includes("lucide-pencil"));
    assert.ok(!html.includes("lucide-trash"));
  });

  it("sürükleme tutamağı yok; demet satırın kendi düğmesine geçiyor", () => {
    const html = render(
      <ChannelItem
        {...baseProps}
        active={false}
        dragHandleProps={
          { "aria-roledescription": "sortable" } as React.HTMLAttributes<HTMLButtonElement>
        }
        name="karsilama"
        type="TEXT"
      />,
    );

    assert.ok(!html.includes("lucide-grip-vertical"));
    assert.ok(html.includes('aria-roledescription="sortable"'));
  });
});
