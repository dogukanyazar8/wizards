import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DiscoverCategoryKeySchema,
  DiscoverCategorySchema,
  DiscoverChannelPageSchema,
  DiscoverChannelSchema,
  DiscoverEventPageSchema,
  DiscoverEventSchema,
  DiscoverLanguagesSchema,
  DiscoverPersonPageSchema,
  DiscoverPersonSchema,
  DiscoverQuerySchema,
  DiscoverServerCategoryKeySchema,
  DiscoverServerPageSchema,
  DiscoverServerSchema,
} from "./discover-screen";
import { assertAccepts, assertRejects } from "./schema-test-helpers";
import { ServerPublicProfileFriendSchema, ServerPublicProfileSchema } from "./workspace";

const server = {
  category: "oyun" as const,
  description: "Haftalık oyun geceleri, turnuvalar ve sahne yayınları.",
  featured: false,
  iconColor: "warning" as const,
  iconUrl: null,
  id: "s1",
  initials: "OYU",
  joined: false,
  languages: ["tr", "en"],
  memberCount: 48_200,
  name: "Oyun Kulübü Türkiye",
  onlineCount: 3_910,
  tags: ["Turnuva", "Sahne", "Türkçe"],
};

const person = {
  avatarUrl: null,
  handle: "selin",
  id: "u1",
  initials: "SA",
  interestTags: ["Tasarım", "Kritik"],
  mutualServerCount: 3,
  mutualServerName: "Whispr Topluluğu",
  name: "Selin Aksoy",
  presence: "online" as const,
  requestSent: false,
};

const channel = {
  activityLabel: "busy" as const,
  dailyMessageCount: 340,
  id: "c1",
  memberPreview: [{ id: "u1", initials: "SA" }],
  name: "tasarım-kritiği",
  serverCategory: "destek" as const,
  serverId: "s17",
  serverName: "Whispr Topluluğu",
};

const event = {
  durationLabel: "1 sa",
  entityType: "STAGE" as const,
  id: "e1",
  interested: false,
  interestedCount: 128,
  locationLabel: "Whispr Topluluğu › Topluluk sahnesi",
  name: "Topluluk sohbeti: Whispr yol haritası",
  scheduledStartAt: "2026-08-22T17:00:00.000Z",
  serverId: "s17",
};

describe("discover — sorgu sözleşmesi", () => {
  it("boş sorgu varsayılanlara düşer", () => {
    assert.deepEqual(DiscoverQuerySchema.parse({}), {
      category: "all",
      lane: "servers",
      sort: "popular",
    });
  });

  it("aramayı kırpar ve 80 karakterle sınırlar", () => {
    assert.equal(DiscoverQuerySchema.parse({ q: "  dil  " }).q, "dil");
    assertRejects(DiscoverQuerySchema, { q: "a".repeat(81) }, ["q"]);
  });

  it("tanınmayan şerit ve sıralamayı reddeder", () => {
    // Varsayılana düşürme **rota katmanının** işidir (`lib/discover/routes.ts`); uç, gövdeyi
    // olduğu gibi kabul ederse hangi sayfanın döndüğü sessizce değişir.
    assertRejects(DiscoverQuerySchema, { lane: "uzay" }, ["lane"]);
    assertRejects(DiscoverQuerySchema, { sort: "alfabetik" }, ["sort"]);
  });
});

describe("discover — kategori ekseni", () => {
  it("'all' bir filtre değeridir, sunucu kategorisi değildir", () => {
    assert.equal(DiscoverCategoryKeySchema.safeParse("all").success, true);
    assert.equal(DiscoverServerCategoryKeySchema.safeParse("all").success, false);
  });

  it("sunucu kategorisi null olabilir", () => {
    assertAccepts(DiscoverServerSchema, { ...server, category: null });
  });

  it("kategori satırı iki harfli tile taşır", () => {
    assertAccepts(DiscoverCategorySchema, {
      count: 20,
      initials: "TÜ",
      key: "all",
      label: "Tümü",
    });
    assertRejects(
      DiscoverCategorySchema,
      { count: 20, initials: "TÜM", key: "all", label: "Tümü" },
      ["initials"],
    );
  });
});

describe("discover — sunucu kaydı", () => {
  it("SPEC §9 dizininin ilk satırını kabul eder", () => {
    assertAccepts(DiscoverServerSchema, server);
  });

  it("sunucu ikonu üç harf ve kendi renk tonunu taşır", () => {
    assertRejects(DiscoverServerSchema, { ...server, initials: "OY" }, ["initials"]);
    assertRejects(DiscoverServerSchema, { ...server, iconColor: "purple" }, ["iconColor"]);
  });

  it("sayıları ham tutar, biçimlendirilmiş etiket kabul etmez", () => {
    // "48,2B" bir sunum kararıdır; `formatServerProfileCount` istemcide çalışır.
    assertRejects(DiscoverServerSchema, { ...server, memberCount: "48,2B" }, ["memberCount"]);
  });

  it("en fazla beş etiket taşır", () => {
    assertRejects(DiscoverServerSchema, { ...server, tags: ["a", "b", "c", "d", "e", "f"] }, [
      "tags",
    ]);
  });
});

describe("discover — dil listesi", () => {
  it("küçük harf BCP-47 kısa kodu ister", () => {
    assertAccepts(DiscoverLanguagesSchema, ["tr", "en", "pt-br"]);
    assertRejects(DiscoverLanguagesSchema, ["TR"]);
  });

  it("en fazla dört giriş alır", () => {
    assertRejects(DiscoverLanguagesSchema, ["tr", "en", "de", "fr", "es"]);
  });
});

describe("discover — kanal kaydı", () => {
  it("hareket etiketi enum'dur, serbest metin değil", () => {
    assertAccepts(DiscoverChannelSchema, channel);
    assertRejects(DiscoverChannelSchema, { ...channel, activityLabel: "Yoğun" }, ["activityLabel"]);
  });

  it("avatar önizlemesi üç kişiyle sınırlıdır", () => {
    assertRejects(
      DiscoverChannelSchema,
      {
        ...channel,
        memberPreview: [
          { id: "u1", initials: "SA" },
          { id: "u2", initials: "MK" },
          { id: "u3", initials: "ZA" },
          { id: "u4", initials: "DY" },
        ],
      },
      ["memberPreview"],
    );
  });
});

describe("discover — kişi ve etkinlik kaydı", () => {
  it("kişi en fazla iki ilgi etiketi taşır", () => {
    assertAccepts(DiscoverPersonSchema, person);
    assertRejects(DiscoverPersonSchema, { ...person, interestTags: ["a", "b", "c"] }, [
      "interestTags",
    ]);
  });

  it("etkinlik başlangıcı ISO tarihidir", () => {
    assertAccepts(DiscoverEventSchema, event);
    assertRejects(DiscoverEventSchema, { ...event, scheduledStartAt: "yarın 20:00" }, [
      "scheduledStartAt",
    ]);
  });
});

describe("discover — sayfa zarfları", () => {
  it("dört zarf da aynı biçimdedir", () => {
    for (const [schema, item] of [
      [DiscoverPersonPageSchema, person],
      [DiscoverChannelPageSchema, channel],
      [DiscoverEventPageSchema, event],
    ] as const) {
      const page = schema.parse({ items: [item], nextCursor: null });
      assert.equal(page.items.length, 1);
      assert.equal(page.nextCursor, null);
    }
  });

  it("sunucu sayfası sayaçları ve öne çıkanı ayrıca taşır", () => {
    // Sayaçlar filtrelenmiş listeden türetilemez: kategori seçiliyken diğerlerinin sayısı da
    // doğru kalmalı (Tuzak 4).
    const page = assertAccepts(DiscoverServerPageSchema, {
      categories: [{ count: 20, initials: "TÜ", key: "all", label: "Tümü" }],
      featured: { ...server, featured: true },
      items: [server],
      nextCursor: "p|48200|s1",
    });

    assert.equal(page.categories.length, 1);
    assert.equal(page.featured?.featured, true);
  });

  it("bayraklı sunucu yoksa öne çıkan null olur", () => {
    assertAccepts(DiscoverServerPageSchema, {
      categories: [],
      featured: null,
      items: [],
      nextCursor: null,
    });
  });
});

describe("discover — profil şemasının genişlemesi (K3)", () => {
  it("tanıdık kaydı rol ve presence taşır", () => {
    assertAccepts(ServerPublicProfileFriendSchema, {
      avatarUrl: null,
      displayName: "Selin Aksoy",
      id: "u1",
      presence: "online",
      role: "admin",
    });

    assertRejects(ServerPublicProfileFriendSchema, {
      avatarUrl: null,
      displayName: "Selin Aksoy",
      id: "u1",
    });
  });

  it("profil sesli oda sayısını aktif konuşan sayısından ayrı taşır", () => {
    for (const field of ["category", "languages", "voiceRoomCount"]) {
      assert.equal(field in ServerPublicProfileSchema.shape, true, `${field} missing`);
    }

    assert.equal("voiceActiveCount" in ServerPublicProfileSchema.shape, true);
  });
});
