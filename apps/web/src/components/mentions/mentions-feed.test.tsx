import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Mention, MentionCounts } from "@wizards/types";

import { MentionsEmptyState } from "@/components/mentions/mentions-empty-state";
import {
  MentionsFeed,
  computeFeedScrollCompensation,
  isMentionFeedAtTop,
  resolveMentionMenuDirection,
  shouldVirtualizeMentionFeed,
} from "@/components/mentions/mentions-feed";
import { MentionsFeedHeader } from "@/components/mentions/mentions-feed-header";
import { MentionsNewStrip } from "@/components/mentions/mentions-new-strip";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { groupMentions, type MentionGroup } from "@/lib/mentions/grouping";
import { MENTIONS_DEFAULT_ROUTE_STATE } from "@/lib/mentions/routes";

/**
 * Ş5 — akışın çizim sözleşmesi (SPEC §4, §5, §5.3, §8).
 *
 * Kartın **içi** Ş6'nın; buradaki testler kartın kendisini değil, akışın onu nereye koyduğunu
 * doğruluyor: grup başlığı, sıra, boş grup, altlık, boş durum ve başlığın panel açıkken
 * kaybolan iki butonu.
 */

const NOW = new Date("2026-08-21T06:41:00.000Z");
const ISTANBUL = "Europe/Istanbul";

function mention(overrides: Partial<Mention> & { id: string }): Mention {
  return {
    author: { avatarUrl: null, handle: "selin", id: "u1", initials: "SA", name: "Selin Aksoy" },
    body: "kart yoğunluğu kararını bugünkü kritiğe alalım mı?",
    createdAt: "2026-08-21T06:41:00.000Z",
    href: "/channels/s1/c1?message=m1",
    kind: "me",
    messageId: "m1",
    permalink: "https://whispr.app/channels/s1/c1?message=m1",
    readLater: false,
    source: {
      channelId: "c1",
      channelName: "tasarım-kritiği",
      serverId: "s1",
      serverInitial: "W",
      serverName: "Whispr Topluluğu",
      type: "channel",
    },
    stateKey: { refId: overrides.id, source: "channel" },
    tag: "@Doğukan Yazar",
    unread: true,
    ...overrides,
    id: `channel:${overrides.id}`,
  };
}

function counts(overrides: Partial<MentionCounts> = {}): MentionCounts {
  return {
    all: 7,
    bySource: { dm: 2, s1: 3, s2: 2 },
    everyone: 1,
    me: 3,
    readLater: 0,
    roleNames: [],
    role: 2,
    thread: 1,
    unread: 2,
    ...overrides,
  };
}

function withLocale(node: React.ReactNode): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      {node}
    </LocaleProvider>,
  );
}

function groupsOf(mentions: readonly Mention[], grouping: "source" | "time" = "time") {
  return groupMentions(mentions, {
    dmLabel: "Direkt mesajlar",
    grouping,
    now: NOW,
    timeZone: ISTANBUL,
  });
}

function renderFeed(overrides: Partial<React.ComponentProps<typeof MentionsFeed>> = {}): string {
  const groups: readonly MentionGroup[] =
    overrides.groups ??
    groupsOf([
      mention({ createdAt: "2026-08-21T06:41:00.000Z", id: "a" }),
      mention({ createdAt: "2026-08-20T18:00:00.000Z", id: "b" }),
    ]);

  return withLocale(
    <MentionsFeed
      cursor={null}
      error={false}
      filtered={false}
      groups={groups}
      hasNextPage={false}
      loading={false}
      loadingMore={false}
      menuId={null}
      newCount={0}
      onAtTopChange={() => undefined}
      onClose={() => undefined}
      onContext={() => undefined}
      onCursorChange={() => undefined}
      onLoadMore={() => undefined}
      onMenuAction={() => undefined}
      onMenuToggle={() => undefined}
      onOpen={() => undefined}
      onReply={() => undefined}
      onRetry={() => undefined}
      onShowNew={() => undefined}
      onToggleRead={() => undefined}
      panelId={null}
      renderCard={(props) => (
        <div data-testid="stub-card" data-mention={props.mention.id}>
          {props.mention.author.name}
        </div>
      )}
      replyId={null}
      routeState={MENTIONS_DEFAULT_ROUTE_STATE}
      {...overrides}
    />,
  );
}

describe("MentionsFeed — iskelet", () => {
  it("akış adlandırılmış bir bölge ve klavye için odaklanabilir", () => {
    const markup = renderFeed();

    // `role="feed"` DEĞİL: ARIA'da `feed`in izin verdiği tek çocuk `article` ve bu akış grup
    // başlığı, sentinel ve şerit de taşıyor — axe `aria-required-children` critical verir.
    assert.match(markup, /role="region"/);
    assert.ok(!markup.includes('role="feed"'));
    assert.match(
      markup,
      /data-testid="mentions-feed"[^>]*tabindex="0"|tabindex="0"[^>]*data-testid="mentions-feed"/,
    );
    assert.match(markup, /aria-label="Bahsetme akışı"/);
  });

  it("grup başlığını etiketi ve sayısıyla çizer", () => {
    const markup = renderFeed();

    assert.match(markup, /data-testid="mentions-group-header"/);
    assert.match(markup, />Bugün</);
    assert.match(markup, />Dün</);
  });

  it("boş grup çizilmez", () => {
    const markup = renderFeed({
      groups: groupsOf([mention({ createdAt: "2026-08-21T06:41:00.000Z", id: "a" })]),
    });

    assert.ok(!markup.includes(">Dün<"));
    assert.ok(!markup.includes(">Bu hafta<"));
  });

  it("K5 — `Sonra oku` grubu listenin ilk başlığı", () => {
    const markup = renderFeed({
      groups: groupsOf([
        mention({ createdAt: "2026-08-21T06:41:00.000Z", id: "a" }),
        mention({ createdAt: "2026-08-10T06:41:00.000Z", id: "saved", readLater: true }),
      ]),
    });

    assert.ok(markup.indexOf(">Sonra oku<") < markup.indexOf(">Bugün<"));
  });

  it("kartı Ş6'nın çizicisine devreder ve sırayı bozmaz", () => {
    const markup = renderFeed();
    const order = [...markup.matchAll(/data-mention="([^"]+)"/g)].map((match) => match[1]);

    assert.deepEqual(order, ["channel:a", "channel:b"]);
  });

  it("altlık yalnız 30 günlük pencerede görünür (SPEC §5.3)", () => {
    assert.match(renderFeed(), /Daha eski bahsetmeler 30 gün sonra arşivlenir/);
    assert.ok(
      !renderFeed({
        routeState: { ...MENTIONS_DEFAULT_ROUTE_STATE, window: "all" },
      }).includes("Daha eski bahsetmeler 30 gün sonra arşivlenir"),
    );
  });

  it("akış geciktiğinde üç kart iskeleti çizer", () => {
    const markup = renderFeed({ groups: [], loading: true });
    const skeletons = [...markup.matchAll(/data-testid="mentions-card-skeleton"/g)];

    assert.equal(skeletons.length, 3);
  });

  it("kart yokken boş durumu çizer", () => {
    const markup = renderFeed({ groups: [] });

    assert.match(markup, /data-testid="mentions-empty-state"/);
    assert.ok(!markup.includes('data-testid="mentions-group-header"'));
  });

  it("hata durumunda ekran kaybolmaz, tekrar denemeyi sunar", () => {
    const markup = renderFeed({ error: true, groups: [] });

    assert.match(markup, /data-testid="mentions-feed-error"/);
    assert.ok(!markup.includes('data-testid="mentions-empty-state"'));
  });

  it("boş durum ve hata bloğu kaydırma kabının dışında çizilir", () => {
    // Referansta ikisi de `padding:16px 24px 20px` taşıyan akış kabının **kardeşi**; içine
    // konsalardı SPEC §8'in `padding:40` değeri kabın dolgusuyla toplanır ve 456px'lik dar
    // akışta metin bloğu 376 yerine 328px'e sıkışırdı.
    for (const markup of [renderFeed({ groups: [] }), renderFeed({ error: true, groups: [] })]) {
      assert.ok(!markup.includes('data-testid="mentions-feed"'));
      assert.match(markup, /data-testid="mentions-feed-shell"/);
    }
  });

  it("yükleniyor hâli akış kabının içinde kalır — iskeletler kart dolgusunu paylaşır", () => {
    const markup = renderFeed({ groups: [], loading: true });

    assert.match(markup, /role="region"/);
    assert.match(markup, /aria-busy="true"/);
  });
});

describe("MentionsFeedHeader — SPEC §4", () => {
  function renderHeader(overrides: Partial<React.ComponentProps<typeof MentionsFeedHeader>> = {}) {
    return withLocale(
      <MentionsFeedHeader
        contextPanelOpen={false}
        count={7}
        counts={counts()}
        empty={false}
        formatTime={() => "09:41"}
        newestAt="2026-08-21T06:41:00.000Z"
        routeState={MENTIONS_DEFAULT_ROUTE_STATE}
        title="Bahsedilmeler"
        {...overrides}
      />,
    );
  }

  it("başlık, sayı pili ve alt satır SPEC'in cümlesini kurar", () => {
    const markup = renderHeader();

    assert.match(markup, />Bahsedilmeler</);
    assert.match(markup, />7 bahsetme</);
    assert.match(markup, />Zamana göre gruplu · 2 okunmamış · en yenisi 09:41</);
  });

  it("gruplama kaynağa alındığında alt satır onu söyler", () => {
    const markup = renderHeader({
      routeState: { ...MENTIONS_DEFAULT_ROUTE_STATE, grouping: "source" },
    });

    assert.match(markup, />Kaynağa göre gruplu · 2 okunmamış · en yenisi 09:41</);
  });

  it("boş durumda pil `Hepsi okundu`, alt satır 30 günü söyler", () => {
    const markup = renderHeader({ count: 0, empty: true, newestAt: null });

    assert.match(markup, />Hepsi okundu</);
    assert.match(markup, />Son 30 gün · bekleyen bahsetme yok</);
  });

  it("damga yokken alt satır hiçbir şey iddia etmez", () => {
    // Yükleme ve hata hâlinde `empty` false, `newestAt` null. Sarkan `… · en yenisi ` de,
    // "bekleyen bahsetme yok" da yanlış olurdu: sayaç ayrı bir istekten geliyor ve pil aynı
    // anda "7 bahsetme" diyebilir.
    const markup = renderHeader({ empty: false, newestAt: null });

    assert.ok(!markup.includes("en yenisi"));
    assert.ok(!markup.includes("bekleyen bahsetme yok"));
    assert.match(markup, /data-testid="mentions-feed-subtitle"[^>]*><\/p>/);
  });

  it("`window=all` boş durumunda alt satır 30 günü iddia etmez", () => {
    const markup = renderHeader({
      count: 0,
      empty: true,
      newestAt: null,
      routeState: { ...MENTIONS_DEFAULT_ROUTE_STATE, window: "all" },
    });

    assert.match(markup, />Tüm zamanlar · bekleyen bahsetme yok</);
    assert.ok(!markup.includes("Son 30 gün"));
  });

  it("sekme pilleri çıplak rakam değil, metin karşılığı da taşır", () => {
    const markup = renderHeader();

    assert.match(markup, /aria-hidden="true">7<\/span><span class="sr-only">7 bahsetme<\/span>/);
  });

  it("dört sekmenin pilleri tek `MentionCounts` nesnesinden okunur", () => {
    const markup = renderHeader();

    // `Rol · @herkes` iki türü birden sayar (2 + 1), `DM` sayısını `bySource`tan alır.
    // Rakam `aria-hidden`; yanındaki `sr-only` metin ne sayıldığını söylüyor.
    for (const [tab, value] of [
      ["all", 7],
      ["unread", 2],
      ["role", 3],
      ["dm", 2],
    ] as const) {
      assert.match(
        markup,
        new RegExp(
          `data-testid="mentions-feed-tab-pill-${tab}"[^>]*><span aria-hidden="true">${value}<`,
        ),
      );
    }
  });

  it("sekme ile ray satırı aynı state: seçili filtre sekmede işaretlenir", () => {
    const markup = renderHeader({
      routeState: { ...MENTIONS_DEFAULT_ROUTE_STATE, filter: "unread" },
    });

    assert.match(markup, /aria-current="true"[^>]*data-testid="mentions-feed-tab-unread"/);
    assert.ok(!/aria-current="true"[^>]*data-testid="mentions-feed-tab-all"/u.test(markup));
  });

  it("sekme adresi filtreyi yazar, paneli ve modalı düşürür", () => {
    const markup = renderHeader({
      routeState: {
        ...MENTIONS_DEFAULT_ROUTE_STATE,
        panel: "channel:1",
        settingsOpen: true,
        source: "s1",
      },
    });

    assert.match(
      markup,
      /data-testid="mentions-feed-tab-dm"[^>]*href="\/mentions\?filter=dm&amp;source=s1"/,
    );
  });

  it("seçili sekmeye tekrar basmak filtreyi kaldırır", () => {
    const markup = renderHeader({
      routeState: { ...MENTIONS_DEFAULT_ROUTE_STATE, filter: "unread" },
    });

    assert.match(markup, /data-testid="mentions-feed-tab-unread"[^>]*href="\/mentions"/);
  });

  it("gruplama butonu ekseni çevirir", () => {
    assert.match(
      renderHeader(),
      /data-testid="mentions-feed-grouping"[^>]*href="\/mentions\?group=source"/,
    );
    assert.match(
      renderHeader({ routeState: { ...MENTIONS_DEFAULT_ROUTE_STATE, grouping: "source" } }),
      /data-testid="mentions-feed-grouping"[^>]*href="\/mentions"/,
    );
  });

  it("bağlam paneli açıkken iki ikon butonu DOM'dan kalkar", () => {
    const open = renderHeader({ contextPanelOpen: true });

    // `display:none` değil, gerçek kaldırma: görünmeyen bir buton odak sırasında kalmamalı.
    assert.ok(!open.includes('data-testid="mentions-feed-header-actions"'));
    assert.ok(!open.includes('data-testid="mentions-feed-grouping"'));
    assert.ok(!open.includes('data-testid="mentions-feed-settings"'));
    assert.ok(!open.includes("display:none"));
    // Sekmeler kalır; daralan başlıkta filtre hâlâ değiştirilebilir.
    assert.match(open, /data-testid="mentions-feed-tabs"/);
  });
});

describe("MentionsEmptyState — SPEC §8", () => {
  function renderEmpty(overrides: Partial<React.ComponentProps<typeof MentionsEmptyState>> = {}) {
    return withLocale(
      <MentionsEmptyState
        filtered={false}
        routeState={MENTIONS_DEFAULT_ROUTE_STATE}
        {...overrides}
      />,
    );
  }

  it("SPEC'in metnini birebir yazar", () => {
    const markup = renderEmpty();

    assert.match(markup, />Bekleyen bahsetme yok</);
    assert.match(markup, /Son 30 günün bahsetmelerini okudun\./);
  });

  it("K7 — `Arşive dön` yalnız pencereyi açar", () => {
    assert.match(
      renderEmpty(),
      /data-testid="mentions-empty-archive"[^>]*href="\/mentions\?window=all"/,
    );
  });

  it("pencere zaten açıkken arşiv butonu çizilmez", () => {
    const markup = renderEmpty({
      routeState: { ...MENTIONS_DEFAULT_ROUTE_STATE, window: "all" },
    });

    assert.ok(!markup.includes('data-testid="mentions-empty-archive"'));
    assert.match(markup, /data-testid="mentions-empty-settings"/);
  });

  it("`Bildirim ayarları` modalı adrese yazar", () => {
    assert.match(
      renderEmpty(),
      /data-testid="mentions-empty-settings"[^>]*href="\/mentions\?modal=settings"/,
    );
  });

  it("filtreli boş sonuçta başlık aynı, metin süzgece işaret eder", () => {
    const markup = renderEmpty({ filtered: true });

    assert.match(markup, />Bekleyen bahsetme yok</);
    assert.match(markup, />Bu daraltmada bekleyen bahsetme yok\.</);
  });
});

describe("MentionsNewStrip", () => {
  it("sayıyı sözlükten yazar", () => {
    assert.match(
      withLocale(<MentionsNewStrip count={3} onClick={() => undefined} />),
      />3 yeni bahsetme</,
    );
  });

  it("yeni bahsetme yokken şerit yok", () => {
    assert.equal(withLocale(<MentionsNewStrip count={0} onClick={() => undefined} />), "");
  });
});

describe("akış ölçüm yardımcıları", () => {
  it("60 karttan uzun listede pencereleme açılır", () => {
    assert.equal(shouldVirtualizeMentionFeed(60), false);
    assert.equal(shouldVirtualizeMentionFeed(61), true);
  });

  it("akışın tepesi kartların değil, akışın kendi üst boşluğu kadar", () => {
    assert.equal(isMentionFeedAtTop(0), true);
    assert.equal(isMentionFeedAtTop(16), true);
    assert.equal(isMentionFeedAtTop(17), false);
  });

  it("kaydırılmış akışta yeni kartın yüksekliği kadar telafi uygulanır", () => {
    assert.equal(
      computeFeedScrollCompensation({
        grew: true,
        nextScrollHeight: 900,
        previousScrollHeight: 780,
        scrollTop: 400,
      }),
      120,
    );
  });

  it("tepedeyken telafi uygulanmaz — kart zaten görünür olmalı", () => {
    assert.equal(
      computeFeedScrollCompensation({
        grew: true,
        nextScrollHeight: 900,
        previousScrollHeight: 780,
        scrollTop: 0,
      }),
      0,
    );
  });

  it("liste kısaldığında ya da büyüme yeni karttan gelmediğinde telafi yok", () => {
    assert.equal(
      computeFeedScrollCompensation({
        grew: false,
        nextScrollHeight: 900,
        previousScrollHeight: 780,
        scrollTop: 400,
      }),
      0,
    );
    assert.equal(
      computeFeedScrollCompensation({
        grew: true,
        nextScrollHeight: 700,
        previousScrollHeight: 780,
        scrollTop: 400,
      }),
      0,
    );
  });

  it("200 kartlık listede akış bütün kartları DOM'a yazmaz", () => {
    const many = Array.from({ length: 200 }, (_unused, index) =>
      mention({ createdAt: "2026-08-21T06:41:00.000Z", id: `k${index}` }),
    );
    const markup = renderFeed({ groups: groupsOf(many) });
    const drawn = [...markup.matchAll(/data-mention="/g)].length;

    assert.equal(shouldVirtualizeMentionFeed(many.length), true);
    // Sunucuda kaydırılabilir eleman yok, o yüzden pencere boş çıkıyor; ölçülen şey
    // "hepsi çizilmedi" — sanal yolun gerçekten devrede olduğu.
    assert.ok(drawn < many.length, `${drawn} kart çizildi`);
  });

  it("menü ilk iki kartta aşağı, sonrakilerde yukarı açılır (SPEC §5.1)", () => {
    assert.equal(resolveMentionMenuDirection(0), "down");
    assert.equal(resolveMentionMenuDirection(1), "down");
    assert.equal(resolveMentionMenuDirection(2), "up");
  });
});
