/**
 * The shape of the "Hakkında" seed, with no Prisma import.
 *
 * Kept apart from `seed-about.ts` so the counts the screens depend on — 2b's
 * `38` badge and 2e's per-tile totals — can be asserted without a database.
 */

export type SeedHelpCategory = "ACCOUNT" | "CHAT" | "MEDIA" | "SERVER";
export type SeedReleaseChangeType = "NEW" | "IMPROVED" | "FIXED";

/** 2b's header badge and the "Tüm sürüm geçmişi (38)" row. */
export const SEEDED_RELEASE_COUNT = 38;

/** 2e's four tiles, in the order the grid renders them. */
export const SEEDED_HELP_CATEGORY_COUNTS: Record<SeedHelpCategory, number> = {
  ACCOUNT: 14,
  CHAT: 22,
  MEDIA: 17,
  SERVER: 9,
};

export const HELP_BASE_URL = process.env.WHISPR_HELP_BASE_URL ?? "https://whispr.team/help";

export type SeedChange = {
  detail?: string;
  title: string;
  type: SeedReleaseChangeType;
};

export type SeedRelease = {
  buildNumber?: number;
  changeCount?: number;
  changes?: SeedChange[];
  codename?: string;
  highlight?: string;
  releasedAt: string;
  sizeBytes?: number;
  summary?: string;
  version: string;
};

export type SeedHelpArticle = {
  category: SeedHelpCategory;
  position: number;
  readMinutes: number;
  slug: string;
  title: string;
  viewCount: number;
};

/** 2a's full release note, taken from the design handoff line for line. */
const ECHO_CHANGES: SeedChange[] = [
  {
    detail:
      "Görünüm ayarlarında dört kademe (14–18px). Sohbet balonları ve kanal mesajları birlikte ölçeklenir; isim, saat ve arayüz metinleri sabit kalır.",
    title: "Mesaj yazı boyutu",
    type: "NEW",
  },
  {
    detail:
      "Kayıt sırasında gerçek seviye gösterilir; sola kaydırarak iptal, yukarı kaydırarak eller serbest kayıt.",
    title: "Sesli mesajlarda canlı dalga formu",
    type: "NEW",
  },
  { title: "Kanal listesi %30 daha hızlı açılıyor", type: "IMPROVED" },
  { title: "Sohbet listesinde okunmamış sayacı anlık güncelleniyor", type: "IMPROVED" },
  { title: "Görüntülü aramada bağlanma süresi ortalama 1,2 sn kısaldı", type: "IMPROVED" },
  { title: "Takip edilen thread'lere gelen yanıtlar bildirim göndermiyordu", type: "FIXED" },
  { title: "Sunucu sessize alma süresi bazı cihazlarda sıfırlanıyordu", type: "FIXED" },
];

export const NAMED_SEED_RELEASES: SeedRelease[] = [
  {
    buildNumber: 8150,
    changes: ECHO_CHANGES,
    codename: "Echo",
    highlight: "okunabilirlik",
    releasedAt: "2026-07-24T09:00:00.000Z",
    // "46,8 MB" in the design; the app formats decimal megabytes.
    sizeBytes: 46_800_000,
    summary:
      "Okunabilirlik güncellemesi. Mesaj tipografisi baştan ölçeklendi, sesli mesaj kaydı yenilendi ve thread bildirimlerindeki uzun süreli hata kapatıldı.",
    version: "0.8.15",
  },
  {
    buildNumber: 8140,
    changeCount: 6,
    highlight: "sunucu keşfet sekmesi",
    releasedAt: "2026-07-10T09:00:00.000Z",
    sizeBytes: 46_100_000,
    version: "0.8.14",
  },
  {
    buildNumber: 8130,
    changeCount: 11,
    codename: "Ripple",
    highlight: "ekran paylaşımı",
    releasedAt: "2026-06-27T09:00:00.000Z",
    sizeBytes: 45_700_000,
    version: "0.8.13",
  },
  {
    buildNumber: 8120,
    changeCount: 4,
    highlight: "uçtan uca ses",
    releasedAt: "2026-06-12T09:00:00.000Z",
    sizeBytes: 45_200_000,
    version: "0.8.12",
  },
  {
    buildNumber: 8110,
    changeCount: 9,
    highlight: "sohbet arama",
    releasedAt: "2026-05-29T09:00:00.000Z",
    sizeBytes: 44_800_000,
    version: "0.8.11",
  },
  {
    buildNumber: 8100,
    changeCount: 14,
    codename: "Chime",
    highlight: "yeni ses altyapısı",
    releasedAt: "2026-05-15T09:00:00.000Z",
    sizeBytes: 44_300_000,
    version: "0.8.10",
  },
  {
    buildNumber: 7090,
    changeCount: 8,
    highlight: "thread'ler",
    releasedAt: "2025-12-18T09:00:00.000Z",
    sizeBytes: 41_900_000,
    version: "0.7.9",
  },
];

/**
 * Fills the history back to 38 rows. Synthetic but consistent: version numbers
 * count down, dates step back a fortnight at a time, and the change counts are
 * derived rather than random so a reseed produces the same list.
 */
export function buildFillerReleases(count: number): SeedRelease[] {
  const releases: SeedRelease[] = [];
  const oldestNamed = new Date("2025-12-18T09:00:00.000Z");
  let minor = 7;
  let patch = 8;

  for (let index = 0; index < count; index += 1) {
    const releasedAt = new Date(oldestNamed.getTime());
    releasedAt.setUTCDate(releasedAt.getUTCDate() - 14 * (index + 1));

    releases.push({
      buildNumber: minor * 1_000 + patch * 10,
      changeCount: 3 + ((index * 7) % 10),
      highlight: `bakım ve kararlılık (${minor}.${patch})`,
      releasedAt: releasedAt.toISOString(),
      sizeBytes: 41_500_000 - index * 250_000,
      version: `0.${minor}.${patch}`,
    });

    patch -= 1;
    if (patch === 0) {
      minor -= 1;
      patch = 9;
    }
  }

  return releases;
}

export function buildSeedReleases(): SeedRelease[] {
  return [
    ...NAMED_SEED_RELEASES,
    ...buildFillerReleases(SEEDED_RELEASE_COUNT - NAMED_SEED_RELEASES.length),
  ];
}

/**
 * Synthesised change rows for a release the seed only knows a count for. The
 * count is what 1c and 2b print, so it has to match the number of rows written.
 */
export function buildSeedChanges(release: SeedRelease): SeedChange[] {
  if (release.changes) {
    return release.changes;
  }

  return Array.from({ length: release.changeCount ?? 0 }, (_, index) => ({
    title: `${release.version} · değişiklik ${index + 1}`,
    type: (["NEW", "IMPROVED", "FIXED"] as const)[index % 3] as SeedReleaseChangeType,
  }));
}

/** `position` restarts per type group, which is how 2a orders inside a heading. */
export function withGroupPositions(changes: SeedChange[]) {
  const positions = new Map<SeedReleaseChangeType, number>();

  return changes.map((change) => {
    const position = positions.get(change.type) ?? 0;
    positions.set(change.type, position + 1);

    return { ...change, position };
  });
}

export const POPULAR_HELP_ARTICLES: Array<Omit<SeedHelpArticle, "position">> = [
  {
    category: "MEDIA",
    readMinutes: 3,
    slug: "sesli-kanalda-mikrofon-calismiyor",
    title: "Sesli kanalda mikrofonum çalışmıyor",
    viewCount: 24_000,
  },
  {
    category: "CHAT",
    readMinutes: 2,
    slug: "kanal-kanal-sessize-alma",
    title: "Bildirimleri kanal kanal sessize alma",
    viewCount: 18_000,
  },
  {
    category: "SERVER",
    readMinutes: 5,
    slug: "sunucu-rolleri-ve-izinleri",
    title: "Sunucu rollerini ve izinleri düzenleme",
    viewCount: 11_000,
  },
  {
    category: "ACCOUNT",
    readMinutes: 4,
    slug: "iki-adimli-dogrulamayi-acma",
    title: "İki adımlı doğrulamayı açma",
    viewCount: 9_000,
  },
];

const HELP_FILLER_TOPICS: Record<SeedHelpCategory, string> = {
  ACCOUNT: "Hesap ve güvenlik",
  CHAT: "Sohbet ve kanallar",
  MEDIA: "Ses ve görüntü",
  SERVER: "Sunucu yönetimi",
};

export function buildSeedHelpArticles(): SeedHelpArticle[] {
  const articles: SeedHelpArticle[] = POPULAR_HELP_ARTICLES.map((article, index) => ({
    ...article,
    position: index,
  }));

  for (const [category, total] of Object.entries(SEEDED_HELP_CATEGORY_COUNTS) as Array<
    [SeedHelpCategory, number]
  >) {
    const alreadySeeded = POPULAR_HELP_ARTICLES.filter(
      (article) => article.category === category,
    ).length;

    for (let index = 0; index < total - alreadySeeded; index += 1) {
      articles.push({
        category,
        position: alreadySeeded + index,
        readMinutes: 2 + (index % 5),
        slug: `${category.toLowerCase()}-konu-${index + 1}`,
        title: `${HELP_FILLER_TOPICS[category]} · konu ${index + 1}`,
        viewCount: Math.max(400, 6_000 - index * 350),
      });
    }
  }

  return articles;
}

export function helpArticleUrl(slug: string) {
  return `${HELP_BASE_URL}/${slug}`;
}
