import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";

import { renderWithLocale } from "./home-test-render";

import type { HomeCardState } from "@/hooks/use-home-queries";
import type { FriendDto } from "@/lib/friends/types";
import { HOME_METRICS, pxToRem } from "@/lib/home/metrics";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import type {
  AppAwaitingResponse,
  AppRecentResponse,
  AppSummaryResponse,
  EventsUpcomingResponse,
  VoiceLiveResponse,
} from "@/lib/home/types";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { FocusControlsProvider } from "@/components/providers/focus-controls-provider";

import {
  HomeAwaitingCard as HomeAwaitingCardBase,
  type HomeAwaitingCardProps,
} from "./home-awaiting-card";
import { HOME_CARD_ERROR_KEY } from "./home-card";
import {
  HomeContinueCard as HomeContinueCardBase,
  type HomeContinueCardProps,
} from "./home-continue-card";
import {
  HomeFriendsStrip as HomeFriendsStripBase,
  selectStripFriends,
  type HomeFriendsStripProps,
} from "./home-friends-strip";
import { HomeLiveCard as HomeLiveCardBase, type HomeLiveCardProps } from "./home-live-card";
import { HomePresenceCard as HomePresenceCardBase } from "./home-presence-card";
import {
  HomeUpNextCard as HomeUpNextCardBase,
  type HomeUpNextCardProps,
} from "./home-up-next-card";

/**
 * Altı kartın dört hâli — dolu / yükleniyor / boş / hata (`05-faz4` §8).
 *
 * Kartlar sunum odaklıdır: veriyi prop olarak alırlar, kendi sorgularını açmazlar. Bu yüzden
 * `renderToStaticMarkup` ile React ağacı kurmadan test edilebiliyorlar.
 */

const NOW = new Date("2026-08-19T12:00:00.000Z");
const LOCALE = "tr";

function loading<T>(): HomeCardState<T> {
  return { status: "loading" };
}

function failed<T>(): HomeCardState<T> {
  return { retry: () => undefined, status: "error" };
}

function ready<T>(data: T): HomeCardState<T> {
  return { data, status: "ready" };
}

function actor(id: string, displayName: string) {
  return { avatarUrl: null, displayName, id, presence: "ONLINE" as const };
}

/**
 * Faz 5 kartlara etkileşim proplarını ekledi. Testler kartın **çizimini** sabitliyor, geri
 * çağırımlarını değil (geri çağırımların kendisi `mutations.test.ts` ve `focus-machine.test.ts`
 * içinde saf olarak testli), o yüzden burada boş uçlar veriliyor.
 */
const noop = () => undefined;

function HomeContinueCard(props: Omit<HomeContinueCardProps, "onOpen">) {
  return <HomeContinueCardBase {...props} onOpen={noop} />;
}

function HomeLiveCard(
  props: Omit<HomeLiveCardProps, "isVoiceBusy" | "joinedRoomId" | "notice" | "onJoin" | "onLeave"> &
    Partial<Pick<HomeLiveCardProps, "isVoiceBusy" | "joinedRoomId" | "notice">>,
) {
  return (
    <HomeLiveCardBase
      isVoiceBusy={false}
      joinedRoomId={null}
      notice={null}
      onJoin={noop}
      onLeave={noop}
      {...props}
    />
  );
}

function HomeAwaitingCard(
  props: Omit<HomeAwaitingCardProps, "isAcceptPending" | "notice" | "onAccept"> &
    Partial<Pick<HomeAwaitingCardProps, "isAcceptPending" | "notice">>,
) {
  return (
    <HomeAwaitingCardBase isAcceptPending={() => false} notice={null} onAccept={noop} {...props} />
  );
}

function HomeUpNextCard(
  props: Omit<HomeUpNextCardProps, "isRemindPending" | "notice" | "onRemind"> &
    Partial<Pick<HomeUpNextCardProps, "isRemindPending" | "notice">>,
) {
  return <HomeUpNextCardBase isRemindPending={false} notice={null} onRemind={noop} {...props} />;
}

function HomeFriendsStrip(
  props: Omit<HomeFriendsStripProps, "notice" | "onCall" | "onMessage" | "onProfile"> &
    Partial<Pick<HomeFriendsStripProps, "notice">>,
) {
  return (
    <HomeFriendsStripBase
      notice={null}
      onCall={noop}
      onMessage={noop}
      onProfile={noop}
      {...props}
    />
  );
}

/**
 * `Durumun` kartı odak katmanını `FocusControlsProvider`'dan okuyor (§3.3): üst çubuk pill'i ve
 * kullanıcı ayağı satırıyla **aynı** kaynak. Sağlayıcı bir `QueryClient` istiyor; sunucu render'ı
 * istek açmaz, sorgu boş kalır ve kart kendi `state` prop'unu çizmeye devam eder.
 */
function HomePresenceCard(props: React.ComponentProps<typeof HomePresenceCardBase>) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FocusControlsProvider>
        <HomePresenceCardBase {...props} />
      </FocusControlsProvider>
    </QueryClientProvider>
  );
}

/* ------------------------------------------------------------------ recent */

const RECENT: AppRecentResponse = {
  items: [
    {
      avatarUrl: null,
      href: "/channels/s1/c1",
      id: "c1",
      kind: "channel",
      lastMessage: {
        authorAvatarUrl: null,
        authorName: "Alice",
        text: "Yeni katılanlara hoş geldiniz",
      },
      lastMessageAt: "2026-08-19T11:58:00.000Z",
      mentioned: true,
      name: "welcome-chat",
      presence: null,
      serverName: "Whispr Topluluğu",
      unreadCount: 3,
    },
    {
      avatarUrl: null,
      href: "/messages/d1",
      id: "d1",
      kind: "dm",
      lastMessage: { authorAvatarUrl: null, authorName: "Mert", text: "Notları attım" },
      lastMessageAt: "2026-08-19T11:18:00.000Z",
      mentioned: false,
      name: "Mert Kaya",
      presence: "IDLE",
      serverName: null,
      unreadCount: 0,
    },
  ],
};

describe("KALDIĞIN YER — dört hâl", () => {
  it("Tümünü gör yerel pencereyi duyuran gerçek bir düğmedir", () => {
    const html = renderWithLocale(
      <HomeContinueCard now={NOW} rowCount={4} state={ready(RECENT)} />,
    );
    const control = html.match(/<button[^>]*data-testid="home-header-link"[^>]*>/)?.[0] ?? "";

    assert.match(control, /aria-haspopup="dialog"/);
    assert.match(control, /aria-expanded="false"/);
    assert.doesNotMatch(control, /href=/);
  });

  it("dolu: satırlar, zaman ve rozet çizilir", () => {
    const html = renderWithLocale(
      <HomeContinueCard now={NOW} rowCount={4} state={ready(RECENT)} />,
    );

    assert.match(html, /welcome-chat/);
    assert.match(html, /Whispr Topluluğu/);
    assert.match(html, /2 dk/);
    assert.match(html, /Alice:/);
    assert.match(html, /&gt;3&lt;|>3</);
    assert.match(html, /Mert Kaya/);
    assert.match(html, />DM</);
  });

  it("dolu: satırın tamamı tek bağlantıdır, iç içe tıklanabilir öğe yok", () => {
    const html = renderWithLocale(
      <HomeContinueCard now={NOW} rowCount={4} state={ready(RECENT)} />,
    );
    const rows = html.split('data-testid="home-continue-row"').slice(1);

    assert.equal(rows.length, 2);
    for (const row of rows) {
      const body = row.split("</a>")[0] ?? "";
      assert.doesNotMatch(body, /<button|<a /);
    }
  });

  it("dolu: presence noktası yalnız sunucudan geldiğinde çizilir", () => {
    const html = renderWithLocale(
      <HomeContinueCard now={NOW} rowCount={4} state={ready(RECENT)} />,
    );

    // DM satırı "Boşta" noktasını taşır; kanal satırında hiç nokta yok.
    assert.equal(html.split('<span class="sr-only">').length - 1, 1);
    assert.match(html, /<span class="sr-only">Boşta<\/span>/);
  });

  it("dolu: okunmamışı olmayan satırda rozet yok", () => {
    const html = renderWithLocale(
      <HomeContinueCard
        now={NOW}
        rowCount={4}
        state={ready({ items: [{ ...RECENT.items[1]!, unreadCount: 0 }] })}
      />,
    );

    assert.doesNotMatch(html, /okunmamış mesaj/);
  });

  it("yükleniyor: iskelet satırı gerçek satırla aynı yüksekliktedir", () => {
    const html = renderWithLocale(<HomeContinueCard now={NOW} rowCount={4} state={loading()} />);
    const expected = pxToRem(
      HOME_METRICS.continueCard.channelIconSize + HOME_METRICS.continueCard.rowPadding * 2,
    );

    assert.match(html, /data-testid="home-continue-skeleton"/);
    assert.equal(html.split(`height:${expected}`).length - 1, 4);
  });

  it("boş: tek satır metin", () => {
    const html = renderWithLocale(
      <HomeContinueCard now={NOW} rowCount={4} state={ready({ items: [] })} />,
    );

    assert.match(html, /Henüz bir yere uğramadın/);
  });

  it("hata: kart içinde tek satır ve tekrar dene", () => {
    const html = renderWithLocale(<HomeContinueCard now={NOW} rowCount={4} state={failed()} />);

    assert.match(html, new RegExp(TR_MESSAGES[HOME_CARD_ERROR_KEY]));
    assert.match(html, /Tekrar dene/);
    // Kart kabuğu ayakta kalır: başlık hâlâ orada.
    assert.match(html, /Kaldığın yer/);
  });
});

/* -------------------------------------------------------------------- live */

const LIVE: VoiceLiveResponse = {
  rooms: [
    {
      caption: "kanal konusu",
      href: "/channels/s1/v1",
      id: "v1",
      kind: "voice",
      name: "live-room",
      participantCount: 12,
      participants: [actor("u1", "Can Eren"), actor("u2", "Alice Nowak")],
      serverId: "s1",
      serverName: "Whispr Topluluğu",
      speaker: null,
    },
  ],
  totalCount: 5,
};

describe("ŞU AN CANLI — dört hâl", () => {
  it("dolu: başlık sayısı sunucudan gelen toplamdır, liste uzunluğu değil", () => {
    const html = renderWithLocale(
      <HomeLiveCard audioLevels={{}} reducedMotion={false} roomCount={2} state={ready(LIVE)} />,
    );

    assert.match(html, /5 oda açık/);
    assert.doesNotMatch(html, /1 oda açık/);
  });

  it("dolu: konuşan yoksa konuşan satırı ve dalga formu gizlenir", () => {
    const html = renderWithLocale(
      <HomeLiveCard audioLevels={{}} reducedMotion={false} roomCount={2} state={ready(LIVE)} />,
    );

    assert.doesNotMatch(html, /konuşuyor/);
    assert.match(html, /12 kişi bağlı/);
  });

  it("dolu: ses seviyesi eşiği geçince konuşan satırı çıkar", () => {
    const html = renderWithLocale(
      <HomeLiveCard
        audioLevels={{ u2: 0.6 }}
        reducedMotion={false}
        roomCount={2}
        state={ready(LIVE)}
      />,
    );

    assert.match(html, /Alice Nowak konuşuyor/);
  });

  it("azaltılmış harekette dalga formu düz kalır ve nabız sınıfı CSS ile durur", () => {
    const moving = renderWithLocale(
      <HomeLiveCard
        audioLevels={{ u2: 0.9 }}
        reducedMotion={false}
        roomCount={2}
        state={ready(LIVE)}
      />,
    );
    const still = renderWithLocale(
      <HomeLiveCard audioLevels={{ u2: 0.9 }} reducedMotion roomCount={2} state={ready(LIVE)} />,
    );

    // Konuşan satırı iki durumda da var — susturulan hareket, gizlenen bilgi değil.
    assert.match(still, /Alice Nowak konuşuyor/);
    // Hareketli hâlde çubuklar "yanar"; azaltılmışta hepsi taban yükseklikte ve sönük.
    assert.match(moving, /bg-\[hsl\(var\(--primary\)\)\]/);
    assert.doesNotMatch(still.split("home-live-speaker")[1] ?? "", /height:1[0-9]px/);
    // Nabız sınıfı işaretli; animasyonu `globals.css` medya sorgusu durduruyor (elle doğrulandı).
    assert.match(still, /home-pulse-dot/);
  });

  it("dolu: açıklama katılımcılardan türer, kanal konusu yedektir", () => {
    const html = renderWithLocale(
      <HomeLiveCard audioLevels={{}} reducedMotion={false} roomCount={2} state={ready(LIVE)} />,
    );

    assert.match(html, /Can ve 11 kişi burada/);
    assert.doesNotMatch(html, /kanal konusu/);
  });

  it("dolu: katılımcı yığını gerçek toplamla taşma çipi çizer", () => {
    const html = renderWithLocale(
      <HomeLiveCard audioLevels={{}} reducedMotion={false} roomCount={2} state={ready(LIVE)} />,
    );

    assert.match(html, /\+10/);
  });

  it("yükleniyor / boş / hata", () => {
    const skeleton = renderWithLocale(
      <HomeLiveCard audioLevels={{}} reducedMotion={false} roomCount={2} state={loading()} />,
    );
    const empty = renderWithLocale(
      <HomeLiveCard
        audioLevels={{}}
        reducedMotion={false}
        roomCount={2}
        state={ready({ rooms: [], totalCount: 0 })}
      />,
    );
    const error = renderWithLocale(
      <HomeLiveCard audioLevels={{}} reducedMotion={false} roomCount={2} state={failed()} />,
    );

    assert.match(skeleton, /data-testid="home-live-skeleton"/);
    assert.match(empty, /Şu an açık oda yok/);
    // Oda yokken nabız da yok.
    assert.doesNotMatch(empty, /home-pulse-dot/);
    assert.match(error, new RegExp(TR_MESSAGES[HOME_CARD_ERROR_KEY]));
  });
});

/* ---------------------------------------------------------------- awaiting */

const AWAITING: AppAwaitingResponse = {
  items: [
    {
      action: "reply",
      context: "#tasarım-review",
      href: "/channels/s1/c2",
      id: "a1",
      occurredAt: "2026-08-19T11:42:00.000Z",
      reason: "Akış onayını bekliyor",
      source: "mention",
      user: actor("u3", "Selin Aksoy"),
    },
    {
      action: null,
      context: "karşılama akışı",
      href: "/channels/s1/c3",
      id: "a2",
      occurredAt: "2026-08-19T11:00:00.000Z",
      reason: "Görüşünü istiyor",
      source: "reply",
      user: actor("u4", "Alice Nowak"),
    },
  ],
  newCount: 2,
  total: 2,
};

describe("YANIT BEKLİYOR — dört hâl", () => {
  it("dolu: satır bağlantı, aksiyon butonu kardeş öğedir", () => {
    const html = renderWithLocale(
      <HomeAwaitingCard now={NOW} rowCount={4} state={ready(AWAITING)} />,
    );
    const firstRow = html.split('data-testid="home-awaiting-row"')[1] ?? "";
    const anchorBody = firstRow.split("</a>")[0] ?? "";

    assert.doesNotMatch(anchorBody, /<button/);
    assert.match(firstRow, /data-testid="home-awaiting-action"/);
    assert.match(html, /Yanıtla/);
    assert.match(html, /href="\/mentions"/);
  });

  it("dolu: aksiyonsuz satırda buton yok", () => {
    const html = renderWithLocale(
      <HomeAwaitingCard
        now={NOW}
        rowCount={4}
        state={ready({ ...AWAITING, items: [AWAITING.items[1]!] })}
      />,
    );

    assert.doesNotMatch(html, /data-testid="home-awaiting-action"/);
  });

  it("dolu: `newCount` 0 ise pill çizilmez", () => {
    const withPill = renderWithLocale(
      <HomeAwaitingCard now={NOW} rowCount={4} state={ready(AWAITING)} />,
    );
    const withoutPill = renderWithLocale(
      <HomeAwaitingCard now={NOW} rowCount={4} state={ready({ ...AWAITING, newCount: 0 })} />,
    );

    assert.match(withPill, /2 yeni/);
    assert.doesNotMatch(withoutPill, /yeni</);
  });

  it("yükleniyor / boş / hata", () => {
    const skeleton = renderWithLocale(
      <HomeAwaitingCard now={NOW} rowCount={5} state={loading()} />,
    );
    const empty = renderWithLocale(
      <HomeAwaitingCard
        now={NOW}
        rowCount={4}
        state={ready({ items: [], newCount: 0, total: 0 })}
      />,
    );
    const error = renderWithLocale(<HomeAwaitingCard now={NOW} rowCount={4} state={failed()} />);

    assert.equal(skeleton.split("animate-pulse").length - 1, 5);
    assert.match(empty, /Bekleyen isteğin yok/);
    assert.match(error, /Tekrar dene/);
  });
});

/* ---------------------------------------------------------------- presence */

const SUMMARY: AppSummaryResponse = {
  dateLabel: "2026-08-19T12:00:00.000Z",
  dmUnread: 3,
  focus: {
    active: true,
    expiresAt: "2026-08-19T12:10:00.000Z",
    minutesLeft: 10,
    totalMinutes: 25,
  },
  greetingName: "Doğukan",
  pendingReplies: 2,
  presence: "DND",
  unreadMentions: 3,
};

describe("DURUMUN — dört hâl", () => {
  it("dolu: aktif çip presence'ı izler ve `aria-pressed` taşır", () => {
    const html = renderWithLocale(<HomePresenceCard state={ready(SUMMARY)} />);

    assert.match(html, /aria-pressed="true"[^>]*data-testid="home-presence-chip-dnd"/);
    assert.match(html, /aria-pressed="false"[^>]*data-testid="home-presence-chip-online"/);
  });

  it("dolu: odak açıkken ilerleme çubuğu geçen süreyi bildirir", () => {
    const html = renderWithLocale(<HomePresenceCard state={ready(SUMMARY)} />);

    assert.match(html, /role="progressbar"/);
    assert.match(html, /aria-valuenow="15"/);
    assert.match(html, /aria-valuemax="25"/);
    assert.match(html, /15 dk geçti/);
    assert.match(html, /10 dk sonra otomatik kapanır/);
    assert.match(html, /aria-checked="true"/);
  });

  it("odak kapalı: çubuk gizlenir ama yerine aynı yükseklikte boşluk kalır", () => {
    const html = renderWithLocale(
      <HomePresenceCard state={ready({ ...SUMMARY, focus: null, presence: "ONLINE" })} />,
    );
    const { presenceCard } = HOME_METRICS;
    const spacer = pxToRem(
      presenceCard.progressMarginTop +
        presenceCard.progressHeight +
        presenceCard.progressLabelMarginTop +
        10.5,
    );

    assert.doesNotMatch(html, /role="progressbar"/);
    assert.match(html, new RegExp(`height:${spacer}`));
    assert.match(html, /aria-checked="false"/);
  });

  it("yükleniyor / hata", () => {
    assert.match(
      renderWithLocale(<HomePresenceCard state={loading()} />),
      /data-testid="home-presence-skeleton"/,
    );
    assert.match(renderWithLocale(<HomePresenceCard state={failed()} />), /Tekrar dene/);
  });
});

/* ----------------------------------------------------------------- up next */

const UPCOMING: EventsUpcomingResponse = {
  next: {
    attendeeCount: 6,
    attendees: [actor("u5", "Selin"), actor("u6", "Mert")],
    context: "#tasarım · sesli oda · haftalık",
    href: "/channels/s1/c9",
    id: "e1",
    interested: false,
    serverId: "s1",
    startAt: "2026-08-19T15:00:00.000Z",
    title: "Tasarım Kritiği",
  },
  totalCount: 6,
  upcoming: [
    {
      context: "Oyun Kulübü · 16 takım",
      id: "e2",
      startAt: "2026-08-19T21:30:00.000Z",
      title: "PUBG Turnuvası",
    },
    {
      context: "Product Team · v2.4 notları",
      id: "e3",
      startAt: "2026-08-20T10:30:00.000Z",
      title: "Sürüm Toplantısı",
    },
  ],
};

describe("SIRADAKİ — dört hâl", () => {
  it("dolu: kalan süre, gün etiketi ve etkinlik sayısı", () => {
    const html = renderWithLocale(
      <HomeUpNextCard locale={LOCALE} now={NOW} rowCount={3} state={ready(UPCOMING)} />,
    );

    assert.match(html, /180 dk kaldı/);
    assert.match(html, /6 etkinlik/);
    assert.match(html, /6 kişi katılıyor/);
    assert.match(html, /PUBG Turnuvası/);
    assert.match(html, /Hatırlat/);
    assert.match(html, /bg-amber-400/);
  });

  it("dolu: geçmiş bir etkinlikte kalan süre negatife düşmez", () => {
    const html = renderWithLocale(
      <HomeUpNextCard
        locale={LOCALE}
        now={new Date("2026-08-19T16:00:00.000Z")}
        rowCount={3}
        state={ready(UPCOMING)}
      />,
    );

    assert.match(html, /0 dk kaldı/);
  });

  it("yükleniyor / boş / hata", () => {
    const skeleton = renderWithLocale(
      <HomeUpNextCard locale={LOCALE} now={NOW} rowCount={3} state={loading()} />,
    );
    const empty = renderWithLocale(
      <HomeUpNextCard
        locale={LOCALE}
        now={NOW}
        rowCount={3}
        state={ready({ next: null, totalCount: 0, upcoming: [] })}
      />,
    );
    const error = renderWithLocale(
      <HomeUpNextCard locale={LOCALE} now={NOW} rowCount={3} state={failed()} />,
    );

    assert.match(skeleton, /data-testid="home-up-next-event-skeleton"/);
    assert.match(empty, /Yaklaşan etkinlik yok/);
    assert.match(error, /Tekrar dene/);
  });
});

/* ----------------------------------------------------------------- friends */

function friend(overrides: Partial<FriendDto> & { id: string }): FriendDto {
  return {
    allowsGroupInvites: true,
    avatarUrl: null,
    customStatus: null,
    displayName: overrides.id,
    lastSeenAt: null,
    presence: { customStatus: null, status: "ONLINE" },
    status: "ONLINE",
    username: overrides.id,
    voiceRoom: null,
    ...overrides,
  };
}

const FRIENDS: FriendDto[] = [
  friend({
    displayName: "Selin",
    id: "f1",
    voiceRoom: {
      channelId: "c1",
      channelName: "live-room",
      serverId: "s1",
      serverName: "Whispr",
    },
  }),
  friend({ customStatus: "Valorant oynuyor", displayName: "Mert", id: "f2" }),
  friend({ displayName: "Emre", id: "f3", status: "DND" }),
  friend({
    displayName: "Zeynep",
    id: "f4",
    lastSeenAt: "2026-08-19T11:48:00.000Z",
    status: "IDLE",
  }),
  friend({ displayName: "Kerem", id: "f5", status: "OFFLINE" }),
];

describe("ARKADAŞLAR — dört hâl", () => {
  it("dolu: başlık çevrimiçi ve toplam sayıyı ayrı ayrı verir", () => {
    const html = renderWithLocale(
      <HomeFriendsStrip cardCount={6} now={NOW} state={ready(FRIENDS)} />,
    );

    assert.match(html, /4 çevrimiçi/);
    assert.match(html, /· 5 kişiden/);
    assert.match(html, /href="\/messages\/friends"/);
  });

  it("dolu: durum metni öncelik sırasını izler", () => {
    const html = renderWithLocale(
      <HomeFriendsStrip cardCount={6} now={NOW} state={ready(FRIENDS)} />,
    );

    assert.match(html, /live-room&#x27;da|live-room'da/);
    assert.match(html, /Valorant oynuyor/);
    assert.match(html, /Rahatsız etmeyin/);
    assert.match(html, /12 dk boşta/);
  });

  it("dolu: ölçek adımı kadar kart çizilir, çevrimdışı arkadaş girmez", () => {
    const html = renderWithLocale(
      <HomeFriendsStrip cardCount={2} now={NOW} state={ready(FRIENDS)} />,
    );

    assert.equal(html.split('data-testid="home-friend-card"').length - 1, 2);
    assert.doesNotMatch(html, /Kerem/);
  });

  it("sıralama kararlıdır: çevrimiçi → boşta → meşgul, sonra ada göre", () => {
    assert.deepEqual(
      selectStripFriends(FRIENDS, 10).map((entry) => entry.id),
      // Çevrimiçi ikili ada göre: "Mert" < "Selin". Sonra boşta, en sonda meşgul.
      ["f2", "f1", "f4", "f3"],
    );
  });

  it("yükleniyor / boş / hata", () => {
    const skeleton = renderWithLocale(
      <HomeFriendsStrip cardCount={6} now={NOW} state={loading()} />,
    );
    const empty = renderWithLocale(<HomeFriendsStrip cardCount={6} now={NOW} state={ready([])} />);
    const error = renderWithLocale(<HomeFriendsStrip cardCount={6} now={NOW} state={failed()} />);

    assert.equal(skeleton.split("animate-pulse").length - 1, 6);
    assert.match(empty, /Çevrimiçi arkadaşın yok/);
    assert.match(error, /Tekrar dene/);
  });
});
