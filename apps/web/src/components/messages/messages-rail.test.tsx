import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConversationRowDTO } from "@wizards/types";

import { MessagesRail } from "@/components/messages/messages-rail";
import { AppNavPanel } from "@/components/shell/app-nav-panel";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { SocketContext } from "@/components/providers/socket-provider";
import { VoiceStateContext } from "@/components/providers/voice-context";
import { getMessagesForLocale } from "@/lib/locale";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

const FAKE_SOCKET = {
  connected: false,
  disconnect: () => undefined,
  emit: () => undefined,
  off: () => undefined,
  on: () => undefined,
} as never;

const FAKE_VOICE_STATE = {
  isDeafened: false,
  isMuted: false,
  leaveChannel: async () => undefined,
  toggleDeafen: async () => undefined,
  toggleMute: async () => undefined,
} as never;

function row(overrides: Partial<ConversationRowDTO> = {}): ConversationRowDTO {
  return {
    id: "conv-1",
    initials: "SA",
    kind: "dm",
    name: "Selin Aksoy",
    pinned: false,
    presence: "online",
    preview: { authorPrefix: null, text: "Kritiğe bunu getirelim" },
    tileColor: null,
    timeLabel: "09:26",
    unreadCount: 0,
    ...overrides,
  };
}

function renderRail(overrides: Partial<React.ComponentProps<typeof MessagesRail>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <MessagesRail
        activeConversationId={null}
        loading={false}
        onNewGroup={() => undefined}
        onNewMessage={() => undefined}
        rowCount={9}
        rows={[row()]}
        unreadTotal={0}
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("sohbet rayı — başlık ve aksiyonlar", () => {
  it("SPEC §3'ün genişliğinde çizilir", () => {
    assert.match(renderRail(), new RegExp(`width:${pxToRem(MESSAGES_METRICS.rail.width)}`));
  });

  it("başlığı ve iki birincil aksiyonu taşır", () => {
    const markup = renderRail();

    assert.match(markup, /Mesajlar/);
    assert.match(markup, /Yeni mesaj/);
    assert.match(markup, /lucide-plus/);
    assert.doesNotMatch(markup, /lucide-pen/);
    assert.match(markup, /data-testid="messages-rail-new-group"/);
    assert.match(markup, /aria-label="Yeni grup sohbeti"/);
  });

  it("okunmamış yokken toplam rozeti çizilmez", () => {
    assert.doesNotMatch(renderRail(), /data-testid="messages-rail-unread-total"/);
    assert.match(renderRail({ unreadTotal: 3 }), /data-testid="messages-rail-unread-total"/);
  });

  /**
   * SPEC §3 başlığın sağında bir filtre/sıralama butonu tarif ediyor;
   * `Mesajlar.dc.html` çizmiyor ve `screens/01` ile `08` HTML'i doğruluyor.
   * Otorite HTML — buton yok.
   */
  it("filtre/sıralama butonu çizmez", () => {
    assert.doesNotMatch(renderRail(), /messages-rail-filter/);
  });
});

describe("sohbet rayı — bölümler", () => {
  it("sabitlenenleri ayrı bölümde toplar", () => {
    const markup = renderRail({
      rows: [row({ id: "a", pinned: true }), row({ id: "b", name: "Mert Kaya" })],
    });

    assert.match(markup, /Sabitlenenler/);
    assert.match(markup, /Sohbetler/);
    assert.match(markup, /data-testid="messages-rail-pinned"/);
    assert.match(markup, /data-testid="messages-rail-conversations"/);
  });

  it("sabitlenen yokken o bölüm hiç çizilmez", () => {
    const markup = renderRail();

    assert.doesNotMatch(markup, /Sabitlenenler/);
    assert.match(markup, /Sohbetler/);
  });

  it("satır gerçek bir bağlantıdır", () => {
    // `button` olsaydı geri/ileri, orta tık ve "yeni sekmede aç" kaybolurdu.
    assert.match(renderRail(), /<a[^>]+href="\/messages\/conv-1"/);
  });

  it("aktif satır işaretlenir", () => {
    const markup = renderRail({ activeConversationId: "conv-1" });

    assert.match(markup, /aria-current="page"/);
    assert.match(markup, /data-active="true"/);
  });
});

describe("sohbet rayı — okunmamış rozeti", () => {
  it("sayıyı okunabilir bir cümleyle birlikte verir", () => {
    // Ekran okuyucu yalnız "3" duyarsa neyin üçü olduğunu bilmez.
    const markup = renderRail({ rows: [row({ unreadCount: 3 })] });

    assert.match(markup, /3 okunmamış mesaj/);
  });

  it("okunmamış satırın adı daha kalın çizilir", () => {
    const { rail } = MESSAGES_METRICS;
    const unread = renderRail({ rows: [row({ unreadCount: 2 })] });
    const read = renderRail();

    assert.match(unread, new RegExp(`font-weight:${rail.rowNameWeightUnread}`));
    assert.match(read, new RegExp(`font-weight:${rail.rowNameWeightRead}`));
  });
});

describe("sohbet rayı — durumlar", () => {
  it("yüklenirken ölçek adımı kadar iskelet satırı çizer", () => {
    const markup = renderRail({ loading: true, rowCount: 9 });

    assert.match(markup, /data-testid="messages-rail-skeleton"/);
    assert.doesNotMatch(markup, /data-testid="messages-rail-row"/);
  });

  it("hiç sohbet yokken boş durum metni verir", () => {
    const markup = renderRail({ rows: [] });

    assert.match(markup, /data-testid="messages-rail-empty"/);
    assert.match(markup, /Henüz sohbetin yok/);
  });
});

describe("okunmamış sayısı tek kaynaktan (PROMPT §9)", () => {
  /**
   * Gezinme panelindeki `Mesajlar` rozeti ile rayın başlığındaki sayı aynı
   * olmak zorunda. İki yüzey aynı fikstürle birlikte çizilir; ikisi de aynı
   * sayıyı gösteriyor mu diye bakılır.
   */
  it("nav paneli ile ray aynı sayıyı gösterir", () => {
    const unreadTotal = 3;
    const railMarkup = renderRail({ unreadTotal });
    const navMarkup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        <SocketContext.Provider value={FAKE_SOCKET}>
          <VoiceStateContext.Provider value={FAKE_VOICE_STATE}>
            <AppNavPanel
              activeServerId={null}
              currentUser={{
                avatarUrl: null,
                displayName: "Doğukan Yazar",
                id: "user-1",
                status: "ONLINE",
                username: "dogukan",
              }}
              dmUnreadCount={unreadTotal}
              mentionUnreadCount={0}
              nextEventClock={{ clock: null, hidden: false, live: false }}
              onCurrentUserStatusChange={() => undefined}
              onOpenCreateServer={() => undefined}
              onOpenSettings={() => undefined}
              onPrefetch={() => undefined}
              pathname="/messages"
              resolveServerHref={(item) => `/channels/${item.id}`}
              servers={[]}
            />
          </VoiceStateContext.Provider>
        </SocketContext.Provider>
      </LocaleProvider>,
    );

    assert.match(railMarkup, /3 okunmamış mesaj/);
    assert.match(navMarkup, /3/);
  });
});
