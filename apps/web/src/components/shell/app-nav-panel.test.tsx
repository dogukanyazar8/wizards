import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceServerSummary } from "@wizards/types";
import {
  AppNavPanel,
  isNavRowActive,
  selectServerRowTrailing,
} from "@/components/shell/app-nav-panel";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { SocketContext } from "@/components/providers/socket-provider";
import { VoiceStateContext } from "@/components/providers/voice-context";
import { EVENTS_METRICS } from "@/lib/events/metrics";
import { HOME_METRICS, pxToRem } from "@/lib/home/metrics";
import { getMessagesForLocale } from "@/lib/locale";

/** Ş4 — ipucu varsayılanı: saat yok, hata yok, canlı yok. */
const NO_EVENT_CLOCK = { clock: null, hidden: false, live: false } as const;

const CURRENT_USER = {
  avatarUrl: null,
  displayName: "Doğukan Yazar",
  id: "user-1",
  status: "ONLINE" as const,
  username: "dogukan",
};

function server(overrides: Partial<WorkspaceServerSummary> & { id: string }) {
  return {
    accessLevel: "MEMBER",
    allowFileUploads: true,
    allowGifs: true,
    allowMemberAdds: true,
    defaultChannelId: null,
    deletedMessageNoticeMinutes: 60,
    iconUrl: null,
    inviteCode: null,
    memberCount: 3,
    mentionCount: 0,
    messageCharacterLimit: 2000,
    name: "Whispr Topluluğu",
    shortName: null,
    starred: false,
    unreadCount: 0,
    ...overrides,
  } as WorkspaceServerSummary;
}

/** `UserProfileFooter` soket ve ses bağlamını okur; ikisi de testte sahte değerle karşılanır. */
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

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof AppNavPanel>> = {},
  locale: "en" | "tr" = "tr",
) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale={locale} initialMessages={getMessagesForLocale(locale)}>
      <SocketContext.Provider value={FAKE_SOCKET}>
        <VoiceStateContext.Provider value={FAKE_VOICE_STATE}>
          <AppNavPanel
            activeServerId={null}
            currentUser={CURRENT_USER}
            dmUnreadCount={0}
            mentionUnreadCount={0}
            nextEventClock={NO_EVENT_CLOCK}
            onCurrentUserStatusChange={() => undefined}
            onOpenCreateServer={() => undefined}
            onOpenSettings={() => undefined}
            onPrefetch={() => undefined}
            pathname="/home"
            resolveServerHref={(item) => `/channels/${item.id}`}
            servers={[]}
            {...overrides}
          />
        </VoiceStateContext.Provider>
      </SocketContext.Provider>
    </LocaleProvider>,
  );
}

describe("isNavRowActive", () => {
  it("marks the exact route", () => {
    assert.equal(isNavRowActive("/home", "/home"), true);
    assert.equal(isNavRowActive("/discover", "/discover"), true);
  });

  it("marks nested routes of the same surface", () => {
    assert.equal(isNavRowActive("/messages/conversation-1", "/messages"), true);
    assert.equal(isNavRowActive("/events/2026-08-19", "/events"), true);
  });

  it("does not match a different route with the same prefix", () => {
    assert.equal(isNavRowActive("/homepage", "/home"), false);
    assert.equal(isNavRowActive("/messages", "/home"), false);
  });
});

describe("selectServerRowTrailing", () => {
  it("prefers the unread badge over the online count", () => {
    assert.deepEqual(selectServerRowTrailing({ onlineCount: 12, unreadCount: 3 }), {
      count: 3,
      kind: "badge",
    });
  });

  it("falls back to the online count when nothing is unread", () => {
    assert.deepEqual(selectServerRowTrailing({ onlineCount: 12, unreadCount: 0 }), {
      count: 12,
      kind: "online",
    });
  });

  it("draws nothing when there is neither", () => {
    assert.equal(selectServerRowTrailing({ onlineCount: 0, unreadCount: 0 }), null);
    assert.equal(selectServerRowTrailing({ onlineCount: null, unreadCount: 0 }), null);
  });
});

describe("AppNavPanel", () => {
  it("is a labelled navigation landmark", () => {
    const html = renderPanel();

    assert.match(html, /<nav [^>]*aria-label="Ana navigasyon"/);
    assert.match(html, /data-testid="app-nav-panel"/);
  });

  it("keeps the product name out of the translation dictionary", () => {
    const turkish = renderPanel();
    const english = renderPanel({}, "en");

    assert.match(turkish, />Whispr</);
    assert.match(english, />Whispr</);
  });

  it("draws the five navigation rows as real links", () => {
    const html = renderPanel();

    for (const [href, label] of [
      ["/home", "Ana Sayfa"],
      ["/messages", "Mesajlar"],
      ["/mentions", "Bahsedilmeler"],
      ["/events", "Etkinlikler"],
      ["/discover", "Keşfet"],
    ]) {
      assert.match(html, new RegExp(`<a[^>]*href="${href}"`), href);
      assert.ok(html.includes(label!), label);
    }

    assert.doesNotMatch(html, /<div[^>]*onclick/i);
  });

  it("marks the active row with aria-current and background, without a decorative dot", () => {
    const html = renderPanel({ pathname: "/home" });

    assert.match(
      html,
      /<a[^>]*href="\/home"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/home"/,
    );
    assert.match(html, /hsl\(var\(--primary\)\/0\.13\)/);
    const homeRow = html.split("<li>").find((row) => row.includes('data-testid="app-nav-home"'));
    assert.ok(homeRow);
    assert.doesNotMatch(homeRow, /rounded-full/);
  });

  it("moves aria-current with the route", () => {
    const html = renderPanel({ pathname: "/messages" });
    const rows = html.split("<li>");
    const homeRow = rows.find((row) => row.includes('data-testid="app-nav-home"'));
    const messagesRow = rows.find((row) => row.includes('data-testid="app-nav-messages"'));

    assert.ok(homeRow && messagesRow);
    assert.doesNotMatch(homeRow, /aria-current/);
    assert.match(messagesRow, /aria-current="page"/);
  });

  it("renders no badge when a counter is zero", () => {
    const html = renderPanel({ dmUnreadCount: 0, mentionUnreadCount: 0 });

    assert.doesNotMatch(html, /okunmamış mesaj/);
    assert.doesNotMatch(html, /okunmamış bahsedilme/);
  });

  it("labels both counters for screen readers", () => {
    const html = renderPanel({ dmUnreadCount: 3, mentionUnreadCount: 2 });

    assert.match(html, /aria-label="3 okunmamış mesaj"/);
    assert.match(html, /aria-label="2 okunmamış bahsedilme"/);
  });

  it("lists servers as a real list of links", () => {
    const html = renderPanel({
      servers: [server({ id: "s1" }), server({ id: "s2", name: "Oyun Kulübü" })],
    });

    assert.match(html, /<ul[^>]*aria-labelledby="app-nav-server-section"/);
    assert.match(html, /<li><a[^>]*href="\/channels\/s1"/);
    assert.ok(html.includes("Oyun Kulübü"));
  });

  it("shows the Yeni pill only on an unvisited server", () => {
    const html = renderPanel({
      activeServerId: "s2",
      servers: [server({ id: "s1" }), server({ id: "s2", name: "Oyun Kulübü" })],
    });

    assert.match(html, /data-testid="app-nav-server-new-s1"/);
    assert.doesNotMatch(html, /data-testid="app-nav-server-new-s2"/);
  });

  it("marks only the route server as selected", () => {
    const html = renderPanel({
      activeServerId: "s2",
      servers: [server({ id: "s1" }), server({ id: "s2", name: "Oyun Kulübü" })],
    });
    const rows = html.split("<li>");
    const firstServer = rows.find((row) => row.includes('data-testid="app-nav-server-s1"'));
    const activeServer = rows.find((row) => row.includes('data-testid="app-nav-server-s2"'));

    assert.ok(firstServer && activeServer);
    assert.doesNotMatch(firstServer, /aria-current/);
    assert.match(activeServer, /aria-current="page"/);
    assert.match(activeServer, /hsl\(var\(--surface-soft\)\/0\.6\)/);
  });

  it("never shows an online count and an unread badge on the same row", () => {
    const html = renderPanel({ servers: [server({ id: "s1", unreadCount: 4 })] });
    const row = html.slice(html.indexOf('href="/channels/s1"'));

    assert.match(row, /aria-label="4 okunmamış mesaj"/);
    assert.doesNotMatch(row, /data-testid="app-nav-server-online-s1"/);
  });

  it("tints the server initial from the server identity, never a fixed colour", () => {
    const html = renderPanel({
      servers: [server({ id: "s1" }), server({ id: "s2", name: "Oyun Kulübü" })],
    });

    assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/);
    assert.match(html, /hsl\(var\(--(warning|success|danger|surface-tertiary)\)/);
  });

  it("gives the section add button a name", () => {
    const html = renderPanel();

    assert.match(html, /<button[^>]*aria-label="Sunucu oluştur"/);
  });

  it("reads every measure from HOME_METRICS", () => {
    const html = renderPanel();

    assert.ok(html.includes(`border-radius:${pxToRem(HOME_METRICS.panel.rowRadius)}`));
    assert.ok(html.includes(`padding:0 ${pxToRem(HOME_METRICS.panel.navPaddingX)}`));

    // Tek px kaynağı `hairline()`/`max()` tabanıdır (SPEC §8.2.3); başka px ölçek adımıyla büyümez.
    const styles = Array.from(html.matchAll(/style="([^"]*)"/g), (match) => match[1] ?? "");
    const pxOutsideMax = styles
      .map((style) => style.replace(/max\([^)]*\)/g, ""))
      .filter((style) => /\d+(?:\.\d+)?px/.test(style));

    assert.deepEqual(pxOutsideMax, []);
  });

  // ── Ş4 · SPEC-ETKINLIKLER §2 — kabuğun tek dokunulan yeri ──────────────────

  it("draws the clock hint on the events row", () => {
    const html = renderPanel({ nextEventClock: { clock: "19:30", hidden: false, live: false } });
    const eventsRow = html
      .split("<li>")
      .find((row) => row.includes('data-testid="app-nav-events"'));

    assert.ok(eventsRow);
    assert.match(eventsRow, /data-testid="app-nav-next-event"/);
    assert.ok(eventsRow.includes("19:30"));
  });

  it("draws no hint when there is no upcoming event", () => {
    assert.doesNotMatch(renderPanel(), /data-testid="app-nav-next-event"/);
  });

  it("draws no hint when the query failed (SPEC §2)", () => {
    const html = renderPanel({ nextEventClock: { clock: "19:30", hidden: true, live: false } });

    assert.doesNotMatch(html, /data-testid="app-nav-next-event"/);
    assert.ok(!html.includes("19:30"));
  });

  it("keeps the live dot decorative and the live fact in the row label", () => {
    const html = renderPanel({ nextEventClock: { clock: "19:30", hidden: false, live: true } });
    const eventsRow = html
      .split("<li>")
      .find((row) => row.includes('data-testid="app-nav-events"'));

    assert.ok(eventsRow);
    // Nokta salt görsel; renk tek başına anlam taşımaz.
    assert.match(eventsRow, /aria-hidden="true"[^>]*rounded-full bg-\[hsl\(var\(--danger\)\)\]/);
    assert.match(
      eventsRow,
      /aria-label="Etkinlikler · sıradaki etkinlik 19:30 · şu anda canlı etkinlik var"/,
    );
  });

  it("labels the row without the live sentence when nothing is live", () => {
    const html = renderPanel({ nextEventClock: { clock: "19:30", hidden: false, live: false } });
    const eventsRow = html
      .split("<li>")
      .find((row) => row.includes('data-testid="app-nav-events"'));

    assert.ok(eventsRow);
    assert.match(eventsRow, /aria-label="Etkinlikler · sıradaki etkinlik 19:30"/);
    assert.doesNotMatch(eventsRow, /--danger/);
  });

  it("leaves every other row untouched (Ş4 kapsam sınırı)", () => {
    const html = renderPanel({ nextEventClock: { clock: "19:30", hidden: false, live: true } });
    const rows = html.split("<li>");

    for (const id of ["home", "messages", "mentions", "discover"]) {
      const entry = rows.find((row) => row.includes(`data-testid="app-nav-${id}"`));
      assert.ok(entry, id);
      // Son satırın dilimi kabuğun geri kalanını da taşır; bağlantı gövdesinde kesilir.
      const link = entry.slice(0, entry.indexOf("</a>"));

      assert.doesNotMatch(link, /app-nav-next-event/, id);
      assert.doesNotMatch(link, /--danger/, id);
      assert.doesNotMatch(link, /aria-label=/, id);
    }
  });

  it("reads the hint measures from the events dictionary", () => {
    const html = renderPanel({ nextEventClock: { clock: "19:30", hidden: false, live: true } });

    assert.ok(html.includes(`font-size:${pxToRem(EVENTS_METRICS.navHint.fontSize)}`));
    assert.ok(html.includes(`height:${pxToRem(EVENTS_METRICS.navHint.liveDotSize)}`));
  });

  it("keeps the user footer outside the scroll area", () => {
    const html = renderPanel();
    const scrollStart = html.indexOf("overflow-y-auto");
    const footerStart = html.indexOf('data-notification-popup-anchor="controls-border"');

    assert.ok(scrollStart > 0);
    assert.ok(footerStart > scrollStart);
    assert.match(html.slice(footerStart), /data-testid="user-bar"/);
  });
});
