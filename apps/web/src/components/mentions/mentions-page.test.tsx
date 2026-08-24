import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InfiniteData } from "@tanstack/react-query";
import type { Mention, MentionCounts, MentionListResponse } from "@wizards/types";

import {
  isFilteredMentionView,
  isMentionNotification,
  markAllMentionPagesRead,
  patchMentionInPages,
  prependMentionToPages,
  readMentionFilterCount,
  readMentionHeaderCount,
  removeMentionFromPages,
} from "@/components/mentions/mentions-page";
import { MENTIONS_DEFAULT_ROUTE_STATE } from "@/lib/mentions/routes";

/**
 * Ş5 — durum sahibinin **önbellek** sözleşmesi.
 *
 * Bileşenin kendisi `useSearchParams` ve socket bağlamı istiyor; sunucuda çizilemez. Test
 * edilebilir olan ve gerçekten kırılabilecek olan kısım burada: canlı olayın ve iyimser
 * yazımın sayfaları nasıl değiştirdiği. Bir olayın sayfayı yanlış yamalaması, ekranda
 * olmayan bir bahsetme göstermenin en kısa yolu.
 *
 * NOT (sapma): bu dosya şeridin "Sahiplenilen dosyalar" listesinde yok. Listede sayfanın testi
 * hiç yok; kalite çıtasının "test önce" maddesi ile listedeki eksik arasında testten yana
 * karar verildi. Dosya başka hiçbir şeridin kümesine değmiyor.
 */

function mention(overrides: Partial<Mention> & { id: string }): Mention {
  return {
    author: { avatarUrl: null, handle: "selin", id: "u1", initials: "SA", name: "Selin Aksoy" },
    body: "kritiğe alalım mı?",
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

type Pages = InfiniteData<MentionListResponse, string | undefined>;

function pages(...groups: readonly (readonly Mention[])[]): Pages {
  const total = groups.reduce((count, items) => count + items.length, 0);
  return {
    pageParams: groups.map(() => undefined),
    pages: groups.map((items) => ({
      items: [...items],
      nextCursor: null,
      sourceTitle: null,
      total,
    })),
  };
}

function counts(overrides: Partial<MentionCounts> = {}): MentionCounts {
  return {
    all: 7,
    bySource: { dm: 2, s1: 3 },
    everyone: 1,
    me: 3,
    readLater: 0,
    role: 2,
    roleNames: [],
    thread: 1,
    unread: 2,
    ...overrides,
  };
}

describe("isMentionNotification", () => {
  it("yalnız MENTION bildirimini kabul eder", () => {
    assert.equal(isMentionNotification({ type: "MENTION" }), true);
    assert.equal(isMentionNotification({ type: "FRIEND_REQUEST" }), false);
    assert.equal(isMentionNotification({}), false);
    assert.equal(isMentionNotification(null), false);
  });
});

describe("patchMentionInPages", () => {
  it("yalnız hedef kartı değiştirir", () => {
    const next = patchMentionInPages(
      pages([mention({ id: "a" }), mention({ id: "b" })]),
      "channel:a",
      {
        unread: false,
      },
    );

    assert.deepEqual(
      next?.pages[0]?.items.map((item) => [item.id, item.unread]),
      [
        ["channel:a", false],
        ["channel:b", true],
      ],
    );
  });

  it("ikinci sayfadaki kartı da bulur", () => {
    const next = patchMentionInPages(
      pages([mention({ id: "a" })], [mention({ id: "b" })]),
      "channel:b",
      { readLater: true },
    );

    assert.equal(next?.pages[1]?.items[0]?.readLater, true);
  });

  it("önbellek boşken hiçbir şey uydurmaz", () => {
    assert.equal(patchMentionInPages(undefined, "channel:a", { unread: false }), undefined);
  });
});

describe("removeMentionFromPages", () => {
  it("kartı düşürür, diğerlerine dokunmaz", () => {
    const next = removeMentionFromPages(
      pages([mention({ id: "a" }), mention({ id: "b" })]),
      "channel:a",
    );

    assert.deepEqual(
      next?.pages[0]?.items.map((item) => item.id),
      ["channel:b"],
    );
    assert.equal(next?.pages[0]?.total, 1);
  });
});

describe("prependMentionToPages", () => {
  it("yeni kart ilk sayfanın başına girer", () => {
    const next = prependMentionToPages(pages([mention({ id: "a" })]), mention({ id: "yeni" }));

    assert.deepEqual(
      next?.pages[0]?.items.map((item) => item.id),
      ["channel:yeni", "channel:a"],
    );
    assert.equal(next?.pages[0]?.total, 2);
  });

  it("aynı kart iki kez eklenmez", () => {
    const current = pages([mention({ id: "a" })]);
    const next = prependMentionToPages(current, mention({ id: "a" }));

    assert.equal(next, current);
  });

  it("hiç sayfa yokken bir şey yazmaz — ilk çekme kartı zaten getirecek", () => {
    const empty: Pages = { pageParams: [], pages: [] };

    assert.equal(prependMentionToPages(empty, mention({ id: "a" })), empty);
  });
});

describe("markAllMentionPagesRead", () => {
  it("okunmamışları okur, okunmuşları olduğu gibi bırakır", () => {
    const current = pages([mention({ id: "a" }), mention({ id: "b", unread: false })]);
    const next = markAllMentionPagesRead(current);

    assert.deepEqual(
      next?.pages[0]?.items.map((item) => item.unread),
      [false, false],
    );
    // Değişmeyen kart aynı nesne kalır; gereksiz yeniden çizim yok.
    assert.equal(next?.pages[0]?.items[1], current.pages[0]?.items[1]);
  });
});

describe("readMentionFilterCount", () => {
  it("sekme filtrelerini sekme okuyucusuna devreder", () => {
    assert.equal(readMentionFilterCount(counts(), "all"), 7);
    assert.equal(readMentionFilterCount(counts(), "unread"), 2);
    // `Rol · @herkes` iki türü birden sayar.
    assert.equal(readMentionFilterCount(counts(), "role"), 3);
    assert.equal(readMentionFilterCount(counts(), "dm"), 2);
  });

  it("rayın iki ek filtresini de sayar", () => {
    assert.equal(readMentionFilterCount(counts(), "me"), 3);
    assert.equal(readMentionFilterCount(counts(), "thread"), 1);
  });
});

describe("readMentionHeaderCount", () => {
  it("her filtre/kaynak/arama birleşiminde listenin kesin toplamını verir", () => {
    assert.equal(
      readMentionHeaderCount({ items: [], nextCursor: null, sourceTitle: "Whispr", total: 4 }),
      4,
    );
    assert.equal(readMentionHeaderCount(null), null);
  });
});

describe("isFilteredMentionView", () => {
  it("varsayılan görünüm daraltılmamıştır", () => {
    assert.equal(isFilteredMentionView(MENTIONS_DEFAULT_ROUTE_STATE), false);
  });

  it("pencere daraltma değildir — `all` en geniş görünüm", () => {
    // Boş durumun birincil butonu (`Arşive dön`) tam da oraya götürüyor; daraltma saymak,
    // hiçbir süzgeç uygulamamış kullanıcıya "Bu daraltmada bekleyen bahsetme yok" demek olurdu.
    assert.equal(isFilteredMentionView({ ...MENTIONS_DEFAULT_ROUTE_STATE, window: "all" }), false);
  });

  it("filtre, kaynak ve arama daraltma sayılır", () => {
    for (const narrowed of [
      { filter: "unread" as const },
      { source: "s1" },
      { query: "tasarım" },
    ]) {
      assert.equal(
        isFilteredMentionView({ ...MENTIONS_DEFAULT_ROUTE_STATE, ...narrowed }),
        true,
        JSON.stringify(narrowed),
      );
    }
  });

  it("panel ve modal daraltma değildir — akışın içeriğini değiştirmezler", () => {
    assert.equal(
      isFilteredMentionView({
        ...MENTIONS_DEFAULT_ROUTE_STATE,
        panel: "channel:a",
        settingsOpen: true,
      }),
      false,
    );
  });
});
