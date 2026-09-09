import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Link from "next/link";
import React from "react";

import { renderWithLocale } from "./home-test-render";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { FocusControlsProvider } from "@/components/providers/focus-controls-provider";
import type { HomeCardState } from "@/hooks/use-home-queries";
import type { FriendDto } from "@/lib/friends/types";
import type {
  AppAwaitingResponse,
  AppSummaryResponse,
  EventsUpcomingResponse,
  VoiceLiveResponse,
} from "@/lib/home/types";

import { HomeAwaitingCard } from "./home-awaiting-card";
import { HomeFriendsStrip } from "./home-friends-strip";
import { HomeLiveCard } from "./home-live-card";
import { HomePresenceCard } from "./home-presence-card";
import { HomeHeaderLink } from "./home-primitives";
import { HomeUpNextCard } from "./home-up-next-card";

/**
 * `06-faz5` §1 — SPEC §4'ün etkileşim tablosunun kartlarda **çizilen** yarısı.
 *
 * Karar mantığı saf modüllerde testli (`focus-machine`, `mutations`, `optimistic`,
 * `command-palette`); burada sabitlenen şey markup: hangi buton hangi metni taşıyor, hangisi
 * uçuşta kapanıyor, hangi bağlantı nereye gidiyor, hangi kenar hangi token'ı alıyor.
 *
 * Bu depoda DOM yok (`node:test` + `renderToStaticMarkup`), o yüzden tık simülasyonu e2e'nin işi.
 */

const NOW = new Date("2026-08-19T12:00:00.000Z");
const noop = () => undefined;

function ready<T>(data: T): HomeCardState<T> {
  return { data, status: "ready" };
}

function actor(id: string, displayName: string) {
  return { avatarUrl: null, displayName, id, presence: "ONLINE" as const };
}

function withProviders(node: React.ReactElement) {
  return renderWithLocale(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FocusControlsProvider>{node}</FocusControlsProvider>
    </QueryClientProvider>,
  );
}

describe("HomeHeaderLink", () => {
  it("href verilen başlık kontrolünü Next client bağlantısı olarak kurar", () => {
    const element = HomeHeaderLink({ children: "Bahsedilmeler", fontSize: 12, href: "/mentions" });

    assert.equal(element.type, Link);
  });

  it("yerel pencere aksiyonunu bağlantı yerine gerçek düğme olarak kurar", () => {
    const element = HomeHeaderLink({ children: "Tümünü gör", fontSize: 12, onClick: noop });

    assert.equal(element.type, "button");
    assert.equal(element.props.type, "button");
  });
});

/* ------------------------------------------------------------------- live */

const ROOM = {
  caption: "",
  href: "/channels/s1/v1",
  id: "v1",
  kind: "voice" as const,
  name: "gece-lobisi",
  participantCount: 3,
  participants: [actor("u1", "Selin")],
  serverId: "s1",
  serverName: "Whispr",
  speaker: null,
};

const LIVE: VoiceLiveResponse = { rooms: [ROOM], totalCount: 1 };

function liveMarkup(overrides: Partial<React.ComponentProps<typeof HomeLiveCard>> = {}) {
  return renderWithLocale(
    <HomeLiveCard
      audioLevels={{}}
      isVoiceBusy={false}
      joinedRoomId={null}
      notice={null}
      onJoin={noop}
      onLeave={noop}
      reducedMotion={false}
      roomCount={2}
      state={ready(LIVE)}
      {...overrides}
    />,
  );
}

describe("ŞU AN CANLI — katılma", () => {
  it("katılmadan önce `Katıl`, katıldıktan sonra `Ayrıl`", () => {
    assert.match(liveMarkup(), /Katıl</);
    assert.doesNotMatch(liveMarkup(), /Ayrıl</);

    const joined = liveMarkup({ joinedRoomId: "v1" });
    assert.match(joined, /Ayrıl</);
    assert.doesNotMatch(joined, /Katıl</);
  });

  it("katılınca kart kenarı --success/0.35 olur", () => {
    assert.match(liveMarkup({ joinedRoomId: "v1" }), /border-\[hsl\(var\(--success\)\/0\.35\)\]/);
    assert.doesNotMatch(liveMarkup(), /border-\[hsl\(var\(--success\)\/0\.35\)\]/);
  });

  it("aksiyon gerçek bir `button`, bağlantı değil — iki tık iki istek olmasın diye kapanabiliyor", () => {
    const markup = liveMarkup({ isVoiceBusy: true });

    assert.match(markup, /<button[^>]*data-testid="home-live-join"[^>]*disabled/);
    assert.doesNotMatch(markup, /<a[^>]*data-testid="home-live-join"/);
  });

  it("erişilebilir adı hangi eylemi yapacağını söyler", () => {
    assert.match(liveMarkup(), /aria-label="gece-lobisi — Katıl"/);
    assert.match(liveMarkup({ joinedRoomId: "v1" }), /aria-label="gece-lobisi — Ayrıl"/);
  });

  it("düşen bir katılma kartın içinde tek satır olarak söylenir", () => {
    const markup = liveMarkup({ notice: "Odaya bağlanılamadı" });

    assert.match(markup, /data-testid="home-card-notice"/);
    assert.match(markup, /role="status"/);
    assert.match(markup, /Odaya bağlanılamadı/);
  });
});

/* --------------------------------------------------------------- awaiting */

const AWAITING: AppAwaitingResponse = {
  items: [
    {
      action: "accept",
      context: "",
      href: "/messages",
      id: "friend_request:req-1",
      occurredAt: "2026-08-19T11:00:00.000Z",
      reason: "arkadaşlık isteği",
      source: "friend_request",
      user: actor("u2", "Kerem"),
    },
    {
      action: "reply",
      context: "#genel",
      href: "/channels/s1/c1?message=m1",
      id: "mention:m1",
      occurredAt: "2026-08-19T11:30:00.000Z",
      reason: "seni etiketledi",
      source: "mention",
      user: actor("u3", "Ayşe"),
    },
  ],
  newCount: 2,
  total: 2,
};

function awaitingMarkup(overrides: Partial<React.ComponentProps<typeof HomeAwaitingCard>> = {}) {
  return renderWithLocale(
    <HomeAwaitingCard
      isAcceptPending={() => false}
      notice={null}
      now={NOW}
      onAccept={noop}
      rowCount={4}
      state={ready(AWAITING)}
      {...overrides}
    />,
  );
}

describe("YANIT BEKLİYOR — kabul et ve yanıtla", () => {
  it("`Kabul et` bir buton, `Yanıtla` bir bağlantı", () => {
    const markup = awaitingMarkup();

    assert.match(markup, /<button[^>]*data-testid="home-awaiting-action"[^>]*>Kabul et<\/button>/);
    assert.match(markup, /<a[^>]*data-testid="home-awaiting-action"[^>]*>Yanıtla<\/a>/);
  });

  it("`Yanıtla` hedefe besteci odağı işaretiyle gider", () => {
    assert.match(awaitingMarkup(), /href="\/channels\/s1\/c1\?message=m1&amp;compose=1"/);
  });

  it("uçuşta olan satırın butonu kapalıdır — aynı satır iki kez kabul edilemez", () => {
    const markup = awaitingMarkup({ isAcceptPending: (id) => id === "friend_request:req-1" });

    assert.match(markup, /<button[^>]*data-testid="home-awaiting-action"[^>]*disabled/);
  });

  it("düşen bir kabul kartın içinde söylenir", () => {
    assert.match(awaitingMarkup({ notice: "Kabul edilemedi, tekrar dene" }), /Kabul edilemedi/);
  });
});

/* --------------------------------------------------------------- presence */

const SUMMARY: AppSummaryResponse = {
  dateLabel: NOW.toISOString(),
  dmUnread: 0,
  focus: null,
  greetingName: "Doğukan",
  pendingReplies: 0,
  presence: "ONLINE",
  unreadMentions: 0,
};

describe("DURUMUN — çipler ve odak", () => {
  it("dört çip de gerçek buton ve `aria-pressed` taşır", () => {
    const markup = withProviders(<HomePresenceCard state={ready(SUMMARY)} />);

    // Çip kimlikleri depodaki değerdir: "Görünmez" çipi `OFFLINE` taşır (Faz 3 §2).
    for (const id of ["online", "dnd", "idle", "offline"]) {
      assert.match(markup, new RegExp(`data-testid="home-presence-chip-${id}"`), id);
    }

    assert.match(markup, /aria-pressed="true"[^>]*data-testid="home-presence-chip-online"/);
  });

  it("odak açıkken çipler kilitlenmez", () => {
    const open: AppSummaryResponse = {
      ...SUMMARY,
      focus: {
        active: true,
        expiresAt: "2026-08-19T12:25:00.000Z",
        minutesLeft: 25,
        totalMinutes: 25,
      },
      presence: "DND",
    };

    const markup = withProviders(<HomePresenceCard state={ready(open)} />);
    const chips = markup.match(/data-testid="home-presence-chip-[a-z]+"/g) ?? [];

    assert.equal(chips.length, 4);
    assert.doesNotMatch(markup, /disabled[^>]*data-testid="home-presence-chip/);
  });

  it('toggle `role="switch"` ve `aria-checked` taşır', () => {
    assert.match(
      withProviders(<HomePresenceCard state={ready(SUMMARY)} />),
      /role="switch"[^>]*aria-checked="false"|aria-checked="false"[^>]*role="switch"/,
    );
  });
});

/* ---------------------------------------------------------------- up next */

const UPCOMING: EventsUpcomingResponse = {
  next: {
    attendeeCount: 4,
    attendees: [actor("u4", "Mert")],
    context: "#tasarım",
    href: "/servers/s1/about?event=e1",
    id: "e1",
    interested: false,
    serverId: "s1",
    startAt: "2026-08-19T13:00:00.000Z",
    title: "Sprint",
  },
  totalCount: 1,
  upcoming: [],
};

function upNextMarkup(interested: boolean) {
  return renderWithLocale(
    <HomeUpNextCard
      isRemindPending={false}
      locale="tr"
      notice={null}
      now={NOW}
      onRemind={noop}
      rowCount={3}
      state={ready({ ...UPCOMING, next: { ...UPCOMING.next!, interested } })}
    />,
  );
}

describe("SIRADAKİ — hatırlat ve takvim", () => {
  it("metin `interested` alanından okunur ve öyle kalır", () => {
    assert.match(upNextMarkup(false), />Hatırlat</);
    assert.match(upNextMarkup(true), />Hatırlatılacak</);
  });

  it("basılı durumu `aria-pressed` ile duyurulur", () => {
    assert.match(upNextMarkup(true), /aria-pressed="true"[^>]*data-testid="home-up-next-remind"/);
  });

  it("`Takvim` Etkinlikler ekranına gider", () => {
    // Etkinlikler Ş10: eski liste/takvim ikilisi silindi. `/events` artık tek ekran ve
    // kendi hafta şeridini taşıyor, o yüzden buton `?view=` taşımıyor.
    assert.match(
      upNextMarkup(false),
      /<a[^>]*data-testid="home-up-next-calendar"[^>]*href="\/events"/,
    );
  });
});

/* --------------------------------------------------------------- friends */

const FRIEND: FriendDto = {
  allowsGroupInvites: true,
  avatarUrl: null,
  customStatus: null,
  displayName: "Selin",
  id: "u9",
  lastSeenAt: null,
  presence: { customStatus: null, status: "ONLINE" },
  status: "ONLINE",
  username: "selin",
  voiceRoom: null,
};

function friendsMarkup() {
  return renderWithLocale(
    <HomeFriendsStrip
      cardCount={6}
      notice={null}
      now={NOW}
      onCall={noop}
      onMessage={noop}
      onProfile={noop}
      state={ready([FRIEND])}
    />,
  );
}

describe("ARKADAŞLAR — kart ve bağlam menüsü", () => {
  it("kart bir menü taşıdığını duyurur", () => {
    assert.match(friendsMarkup(), /aria-haspopup="menu"[^>]*data-testid="home-friend-card"/);
  });

  it("kart hâlâ tek odaklanabilir öğe — içine ikinci bir buton girmez", () => {
    const markup = friendsMarkup();
    const card = markup.slice(markup.indexOf('data-testid="home-friend-card"'));

    assert.doesNotMatch(card.slice(0, card.indexOf("</button>")), /<button|<a /);
  });
});
