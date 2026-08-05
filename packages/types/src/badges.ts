import { z } from "zod";

/**
 * Canonical badge catalog. `docs/prompts/rozet-sistemi/00-ortak-baglam.md` §4 is the
 * source of truth for every id, threshold, glyph, tint and priority in this file; a
 * consumer that wants a different threshold changes that document, not this module.
 *
 * Both platforms read names and descriptions from here. They are deliberately absent
 * from `apps/mobile/src/locale/mobile-copy.ts` and `apps/web/src/lib/locale/messages/*`
 * so the two dictionaries cannot drift into showing different users different text.
 */
export const BADGE_IDS = [
  "staff",
  "verified",
  "earlyMember",
  "veteran",
  "inviter",
  "founder",
  "ideaShipped",
  "bugHunter",
  "contributor",
  "streak",
  "regular",
  "voice",
  "broadcaster",
  "supporter",
  "betaTester",
  "event",
] as const;

export type BadgeId = (typeof BADGE_IDS)[number];

export type BadgeFamily = "identity" | "contribution" | "activity" | "commerce" | "event";

/**
 * `derived` badges keep no row: they are recomputed from the `User` row on read.
 * `awarded` rows are written by the evaluator, `granted` rows by an admin.
 */
export type BadgeLayer = "derived" | "awarded" | "granted";

/**
 * The seven tints the profile surface can paint. `staff` is described as indigo in
 * 00 §4, which in this palette is the icon colour of the lavender token pair
 * (`badgeEarlySurface #EEF0FE` / `badgeEarlyIcon #4F46E5`) — the same token, not an
 * eighth tint. 00 §4 "Tint token'ları" fixes the count at three existing plus four new.
 */
export type BadgeTint = "lavender" | "amber" | "green" | "blue" | "purple" | "red" | "neutral";

/** Highest tier any badge in the catalog can reach. */
export const BADGE_MAX_TIER = 3;

/**
 * How long a fetched badge list stays fresh in a client cache.
 *
 * It lives in the shared package for the same reason the copy does: a badge is
 * earned rarely, so a generous window costs nothing, but if the two platforms
 * picked their own numbers the same account would refresh at different moments
 * on a phone and in a browser and appear to hold different badges.
 */
export const BADGE_QUERY_STALE_TIME_MS = 5 * 60 * 1000;

export type BadgeDefinition = {
  id: BadgeId;
  family: BadgeFamily;
  layer: BadgeLayer;
  /** 1-tabanlı; dizinin uzunluğu kademe sayısıdır. */
  thresholds: readonly number[];
  /** Eşiğin birimi — metinde "63/100 gün" üretmek için. */
  unit: "day" | "invite" | "member" | "second" | "count" | "none";
  glyph: string;
  tint: BadgeTint;
  /** Küçük sayı önce çizilir. 00-ortak-baglam §4 sırası. */
  priority: number;
  copy: {
    tr: { name: string; description: string; tiers?: readonly string[] };
    en: { name: string; description: string; tiers?: readonly string[] };
  };
};

export const BADGE_CATALOG: Readonly<Record<BadgeId, BadgeDefinition>> = {
  staff: {
    id: "staff",
    family: "identity",
    layer: "derived",
    thresholds: [1],
    unit: "none",
    glyph: "shield",
    tint: "lavender",
    priority: 1,
    copy: {
      tr: { name: "Ekip", description: "Whispr'ı yapan ekiptensin." },
      en: { name: "Staff", description: "You are part of the team that builds Whispr." },
    },
  },
  verified: {
    id: "verified",
    family: "identity",
    layer: "derived",
    thresholds: [1],
    unit: "none",
    glyph: "check",
    tint: "blue",
    priority: 2,
    copy: {
      tr: {
        name: "Doğrulanmış",
        description: "E-postanı doğruladın ve iki adımlı doğrulamayı açtın.",
      },
      en: {
        name: "Verified",
        description: "You confirmed your email and turned on two-step verification.",
      },
    },
  },
  earlyMember: {
    id: "earlyMember",
    family: "identity",
    layer: "derived",
    thresholds: [1],
    unit: "none",
    glyph: "star",
    tint: "lavender",
    priority: 4,
    copy: {
      tr: { name: "Erken üye", description: "Whispr'ın ilk günlerinden beri buradasın." },
      en: { name: "Early member", description: "You have been here since Whispr's first days." },
    },
  },
  veteran: {
    id: "veteran",
    family: "identity",
    layer: "derived",
    /** Hesap yaşı, gün. 1 / 2 / 3 yıl. */
    thresholds: [365, 730, 1095],
    unit: "day",
    glyph: "calendar",
    tint: "lavender",
    priority: 16,
    copy: {
      tr: {
        name: "Kıdemli",
        description: "Hesabın yıllardır Whispr'da açık.",
        tiers: ["Bir yıllık", "İki yıllık", "Üç yıllık"],
      },
      en: {
        name: "Veteran",
        description: "Your account has been on Whispr for years.",
        tiers: ["One year", "Two years", "Three years"],
      },
    },
  },
  inviter: {
    id: "inviter",
    family: "contribution",
    layer: "awarded",
    thresholds: [1, 10, 50],
    unit: "invite",
    glyph: "person-plus",
    tint: "green",
    priority: 10,
    copy: {
      tr: {
        name: "Davetçi",
        description: "Davetinle Whispr'a yeni insanlar katıldı.",
        tiers: ["Davetçi", "Kıdemli davetçi", "Elçi"],
      },
      en: {
        name: "Inviter",
        description: "People joined Whispr through your invites.",
        tiers: ["Inviter", "Senior inviter", "Ambassador"],
      },
    },
  },
  founder: {
    id: "founder",
    family: "contribution",
    layer: "awarded",
    /** Tek bir sunucudaki üye sayısı; sunucular toplanmaz (00 §4). */
    thresholds: [25, 100],
    unit: "member",
    glyph: "servers",
    tint: "purple",
    priority: 8,
    copy: {
      tr: {
        name: "Kurucu",
        description: "Kurduğun sunucu kalabalık bir topluluğa dönüştü.",
        tiers: ["Kurucu", "Büyük kurucu"],
      },
      en: {
        name: "Founder",
        description: "A server you founded grew into a crowded community.",
        tiers: ["Founder", "Grand founder"],
      },
    },
  },
  ideaShipped: {
    id: "ideaShipped",
    family: "contribution",
    layer: "awarded",
    thresholds: [1],
    unit: "count",
    glyph: "lightbulb",
    tint: "amber",
    priority: 6,
    copy: {
      tr: { name: "Fikir sahibi", description: "Önerdiğin fikir Whispr'a eklendi." },
      en: { name: "Idea shipped", description: "An idea you suggested shipped in Whispr." },
    },
  },
  bugHunter: {
    id: "bugHunter",
    family: "contribution",
    layer: "awarded",
    thresholds: [1, 5],
    unit: "count",
    glyph: "bug",
    tint: "red",
    priority: 11,
    copy: {
      tr: {
        name: "Hata avcısı",
        description: "Bildirdiğin hatalar çözüldü.",
        tiers: ["Hata avcısı", "Usta avcı"],
      },
      en: {
        name: "Bug hunter",
        description: "Bugs you reported were fixed.",
        tiers: ["Bug hunter", "Master hunter"],
      },
    },
  },
  contributor: {
    id: "contributor",
    family: "contribution",
    layer: "granted",
    thresholds: [1],
    unit: "none",
    glyph: "code",
    tint: "neutral",
    priority: 7,
    copy: {
      tr: { name: "Katkıcı", description: "Whispr'ın kaynağına katkı verdin." },
      en: { name: "Contributor", description: "You contributed to Whispr's source." },
    },
  },
  streak: {
    id: "streak",
    family: "activity",
    layer: "awarded",
    /** Ardışık aktif gün. Kademe kalıcıdır, yalnız ilerleme sıfırlanır (00 §4). */
    thresholds: [7, 30, 100],
    unit: "day",
    glyph: "flame",
    tint: "amber",
    priority: 9,
    copy: {
      tr: {
        name: "Seri",
        description: "Whispr'ı gün atlamadan açtın.",
        tiers: ["Yedi gün", "Otuz gün", "Yüz gün"],
      },
      en: {
        name: "Streak",
        description: "You opened Whispr without missing a day.",
        tiers: ["Seven days", "Thirty days", "Hundred days"],
      },
    },
  },
  regular: {
    id: "regular",
    family: "activity",
    layer: "awarded",
    /** Mesaj attığı farklı gün sayısı — mesaj sayısı değil (00 §4). */
    thresholds: [30, 100, 365],
    unit: "day",
    glyph: "chat-bubble",
    tint: "green",
    priority: 12,
    copy: {
      tr: {
        name: "Müdavim",
        description: "Farklı günlerde düzenli olarak sohbete katıldın.",
        tiers: ["Müdavim", "Kıdemli müdavim", "Demirbaş"],
      },
      en: {
        name: "Regular",
        description: "You joined the conversation on many separate days.",
        tiers: ["Regular", "Senior regular", "Fixture"],
      },
    },
  },
  voice: {
    id: "voice",
    family: "activity",
    layer: "awarded",
    /** Toplam `voiceSeconds`: 10 saat / 100 saat. */
    thresholds: [36_000, 360_000],
    unit: "second",
    glyph: "mic",
    tint: "blue",
    priority: 13,
    copy: {
      tr: {
        name: "Sesli sohbetçi",
        description: "Sesli sohbette saatler geçirdin.",
        tiers: ["Sesli sohbetçi", "Ses ustası"],
      },
      en: {
        name: "Voice regular",
        description: "You spent hours in voice chat.",
        tiers: ["Voice regular", "Voice master"],
      },
    },
  },
  broadcaster: {
    id: "broadcaster",
    family: "activity",
    layer: "awarded",
    /** Toplam `screenShareSeconds`: 5 saat. */
    thresholds: [18_000],
    unit: "second",
    glyph: "video",
    tint: "purple",
    priority: 14,
    copy: {
      tr: { name: "Yayıncı", description: "Ekranını paylaşarak saatlerce yayın yaptın." },
      en: { name: "Broadcaster", description: "You shared your screen for hours." },
    },
  },
  supporter: {
    id: "supporter",
    family: "commerce",
    layer: "derived",
    /**
     * Premium gün sayısı. Aboneliğin ilk günü 1 sayılır, böylece yeni destekçi
     * kademe 1'i anında alır; kademe 2 `premiumSince` ≥ 180 gün demektir.
     */
    thresholds: [1, 180],
    unit: "day",
    glyph: "bolt",
    tint: "amber",
    priority: 3,
    copy: {
      tr: {
        name: "Destekçi",
        description: "Whispr'ı ayakta tutanlardansın.",
        tiers: ["Destekçi", "Kıdemli destekçi"],
      },
      en: {
        name: "Supporter",
        description: "You help keep Whispr running.",
        tiers: ["Supporter", "Long-time supporter"],
      },
    },
  },
  betaTester: {
    id: "betaTester",
    family: "event",
    layer: "awarded",
    thresholds: [1],
    unit: "none",
    glyph: "flask",
    tint: "blue",
    priority: 15,
    copy: {
      tr: { name: "Beta testçisi", description: "Yeni sürümleri beta kanalında erkenden denedin." },
      en: { name: "Beta tester", description: "You tried new builds early on the beta channel." },
    },
  },
  event: {
    id: "event",
    family: "event",
    layer: "granted",
    /** Eşiksiz: koşulu admin kararıdır, `expiresAt` zorunludur (00 §4). */
    thresholds: [1],
    unit: "none",
    glyph: "sparkle",
    /**
     * 00 §4 bu rozetin rengini "değişken" bırakıyor ama grant satırında renk alanı
     * yok, dolayısıyla katalog tek bir değer taşımak zorunda. Nötr seçildi: belirli
     * bir etkinliğin rengini uydurmaz. Renk grant başına taşınacaksa prompt 08 açar.
     */
    tint: "neutral",
    priority: 5,
    copy: {
      tr: { name: "Etkinlik", description: "Özel bir Whispr etkinliğine katıldın." },
      en: { name: "Event", description: "You took part in a special Whispr event." },
    },
  },
};

/** Değere göre kazanılmış kademe; 0 = kazanılmamış. */
export function resolveBadgeTier(id: BadgeId, value: number): number {
  const { thresholds } = BADGE_CATALOG[id];
  let tier = 0;
  for (let index = 0; index < thresholds.length; index += 1) {
    if (value >= (thresholds[index] as number)) {
      tier = index + 1;
    }
  }
  return tier;
}

/** Sonraki kademe eşiği ve kalan; son kademedeyse null. */
export function nextBadgeThreshold(
  id: BadgeId,
  value: number,
): { tier: number; threshold: number; remaining: number } | null {
  const { thresholds } = BADGE_CATALOG[id];
  const tier = resolveBadgeTier(id, value);
  if (tier >= thresholds.length) {
    return null;
  }
  const threshold = thresholds[tier] as number;
  return { tier: tier + 1, threshold, remaining: Math.max(0, threshold - value) };
}

type SortableBadge = { id: BadgeId; tier: number; earnedAt?: string };

/**
 * 00 §4 sıralama kuralı: priority → tier desc → earnedAt asc → id.
 * Girdi dizisi değiştirilmez; aynı kullanıcı her açılışta aynı sırayı görür.
 */
export function sortBadges<T extends SortableBadge>(badges: readonly T[]): T[] {
  return [...badges].sort((left, right) => {
    const priorityDelta = BADGE_CATALOG[left.id].priority - BADGE_CATALOG[right.id].priority;
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const tierDelta = right.tier - left.tier;
    if (tierDelta !== 0) {
      return tierDelta;
    }
    // Bilinmeyen `earnedAt` en sona düşer; karşılaştırma yine deterministiktir.
    if (left.earnedAt !== right.earnedAt) {
      if (left.earnedAt === undefined) {
        return 1;
      }
      if (right.earnedAt === undefined) {
        return -1;
      }
      return left.earnedAt < right.earnedAt ? -1 : 1;
    }
    if (left.id === right.id) {
      return 0;
    }
    return left.id < right.id ? -1 : 1;
  });
}

/** Karta sığan üçü + taşma sayısı. */
export function splitBadgesForCard<T extends SortableBadge>(
  badges: readonly T[],
  visibleCount = 3,
): { visible: T[]; overflow: number } {
  const limit = Math.max(0, visibleCount);
  const sorted = sortBadges(badges);
  return { visible: sorted.slice(0, limit), overflow: Math.max(0, sorted.length - limit) };
}

/** The two languages the catalog carries copy for. */
export type BadgeLocale = keyof BadgeDefinition["copy"];

export type BadgeUnit = BadgeDefinition["unit"];

/**
 * `unit: "second"` badges are stored in seconds and shown in hours. Raw seconds
 * never reach a user: "36000/360000 saniye" is unreadable, and the catalog's own
 * thresholds are documented as hours (00 §4).
 */
const SECONDS_PER_HOUR = 3600;

/**
 * One value, ready to print. The unit is returned unchanged so the caller can
 * pick its frame string ("gün", "davet", "üye", "saat") from its own dictionary;
 * `second` maps to the hour label because that is what the number now means.
 */
export function formatBadgeProgressValue(
  id: BadgeId,
  value: number,
): { value: number; unit: BadgeUnit } {
  const { unit } = BADGE_CATALOG[id];
  if (unit !== "second") {
    return { unit, value };
  }

  return { unit, value: Math.floor(value / SECONDS_PER_HOUR) };
}

export type BadgeProgressDisplay = {
  readonly id: BadgeId;
  /** Printable value; hours for a `second` badge. */
  readonly value: number;
  /** Printable next threshold, or `null` at the top tier. */
  readonly nextThreshold: number | null;
  readonly unit: BadgeUnit;
  /** Bar fill, 0–1. Full at the top tier. */
  readonly ratio: number;
  readonly atMaxTier: boolean;
};

/**
 * The progress row a detail surface draws. The ratio is computed on the raw
 * values rather than the printed ones so a bar does not snap between whole
 * hours, while the numbers beside it stay in the unit the user reads.
 */
export function buildBadgeProgressDisplay(progress: BadgeProgress): BadgeProgressDisplay {
  const printed = formatBadgeProgressValue(progress.id, progress.value);
  const atMaxTier = progress.nextThreshold === null;
  const threshold = progress.nextThreshold;

  if (atMaxTier || threshold === null || threshold <= 0) {
    return {
      atMaxTier: true,
      id: progress.id,
      nextThreshold: null,
      ratio: 1,
      unit: printed.unit,
      value: printed.value,
    };
  }

  return {
    atMaxTier: false,
    id: progress.id,
    nextThreshold: formatBadgeProgressValue(progress.id, threshold).value,
    ratio: Math.min(1, Math.max(0, progress.value / threshold)),
    unit: printed.unit,
    value: printed.value,
  };
}

/**
 * "{value}/{next} {unit}" or the top-tier line. Both platforms call this with
 * their own frame strings, so the same account reads the same sentence on a
 * phone and in a browser. `count` and `none` badges carry no unit word and
 * simply print the pair.
 */
export function formatBadgeProgressText(input: {
  readonly display: BadgeProgressDisplay;
  /** Frame string, "En üst kademe". */
  readonly maxTierLabel: string;
  /** Frame string, "{value}/{next} {unit}". */
  readonly template: string;
  readonly unitLabels: Readonly<Partial<Record<BadgeUnit, string>>>;
}): string {
  const { display, maxTierLabel, template, unitLabels } = input;

  if (display.atMaxTier || display.nextThreshold === null) {
    return maxTierLabel;
  }

  return template
    .replace("{value}", String(display.value))
    .replace("{next}", String(display.nextThreshold))
    .replace("{unit}", unitLabels[display.unit] ?? "")
    .trim();
}

/**
 * "Ağustos 2026" / "August 2026". Month and year, never a day: 06 §1 fixes the
 * earned line at month granularity because a badge's exact date is a usage
 * signal the viewer has no business reading off someone else's profile.
 *
 * Built as `{month} {year}` rather than a locale pattern so both platforms
 * print the same string even where their ICU data disagrees on ordering.
 */
export function formatBadgeEarnedMonth(value: string, locale: BadgeLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const month = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "tr-TR", {
    month: "long",
  }).format(date);
  return `${month} ${date.getFullYear()}`;
}

/**
 * Everything a detail surface shows for one badge, in the order 06 §1 fixes:
 * glyph, name, tier label, description, earned date, expiry, progress. Mobile
 * and web both render straight off this model, which is what keeps the two
 * surfaces from drifting into different field sets.
 */
export type BadgeDetailModel = {
  readonly id: BadgeId;
  readonly glyph: string;
  readonly tint: BadgeTint;
  /**
   * False for a row reached from your own "Rozetlerim" list, which is the only
   * surface that shows a badge you do not hold (07 §1). A locked detail keeps
   * the neutral tint and drops the tier line; everything else is identical.
   */
  readonly earned: boolean;
  readonly name: string;
  /** Only badges with more than one tier carry one; single-tier badges get `null`. */
  readonly tierLabel: string | null;
  readonly tier: number;
  readonly description: string;
  readonly earnedAt: string;
  readonly expiresAt: string | null;
  /**
   * Populated only on your own profile. A peer never sees a counter: a `regular`
   * day count or a `voice` hour count leaks how someone uses the app (00 §4).
   */
  readonly progress: BadgeProgressDisplay | null;
};

export function buildBadgeDetailModel(input: {
  readonly badge: EarnedBadge;
  /** Frame string formatter for badges whose catalog copy has no tier names. */
  readonly formatTierLabel: (tier: number) => string;
  readonly isSelf: boolean;
  readonly locale: BadgeLocale;
  readonly progress?: readonly BadgeProgress[] | null | undefined;
}): BadgeDetailModel {
  const { badge, formatTierLabel, isSelf, locale, progress } = input;
  const definition = BADGE_CATALOG[badge.id];
  const copy = definition.copy[locale];
  // A locked row carries tier 0, and a threshold that has not been crossed is
  // not a tier — so it prints no tier label whatever the catalog offers.
  const tiered = definition.thresholds.length > 1 && badge.tier >= 1;
  const row = isSelf ? (progress?.find((entry) => entry.id === badge.id) ?? null) : null;

  return {
    description: copy.description,
    earned: badge.tier >= 1,
    earnedAt: badge.earnedAt,
    expiresAt: badge.expiresAt,
    glyph: definition.glyph,
    id: badge.id,
    name: copy.name,
    progress: row === null ? null : buildBadgeProgressDisplay(row),
    tier: badge.tier,
    tierLabel: tiered ? (copy.tiers?.[badge.tier - 1] ?? formatTierLabel(badge.tier)) : null,
    tint: definition.tint,
  };
}

/**
 * The order "Rozetlerim" prints the family headings in (07 §1). It is not the
 * catalog's priority order: priority ranks single badges against each other for
 * the three-chip row, while this ranks the sections of a full list.
 */
export const BADGE_FAMILY_ORDER: readonly BadgeFamily[] = [
  "identity",
  "contribution",
  "activity",
  "commerce",
  "event",
];

/**
 * One row of the "Rozetlerim" list. Locked badges are rows too: 07 §1 keeps
 * every catalog entry visible, including the ones this account cannot earn, so
 * the list never implies a badge was removed.
 */
export type OwnBadgeEntry = {
  readonly id: BadgeId;
  readonly family: BadgeFamily;
  /** 0 while locked; the row prints no tier label in that state. */
  readonly tier: number;
  readonly earned: boolean;
  /** Present only on an earned row, so `sortBadges` can consume the entry. */
  readonly earnedAt?: string;
  readonly expiresAt: string | null;
  /** Progress rows exist only for badges the evaluator counts. */
  readonly progress: BadgeProgressDisplay | null;
};

export type OwnBadgesSummary = {
  readonly earned: number;
  readonly total: number;
  /** Bar fill, 0–1. */
  readonly ratio: number;
};

/**
 * The "4/16" line. Shared rather than computed per platform because 07 asks the
 * phone and the browser to show the same counter, and "how many badges exist"
 * is a catalog fact, not a screen's opinion.
 */
export function summarizeOwnBadges(input: {
  readonly badges: readonly EarnedBadge[];
}): OwnBadgesSummary {
  const total = BADGE_IDS.length;
  // Defensive `Set`: a duplicated id in a payload must not push the counter
  // past the catalog size and print "17/16".
  const earned = new Set(input.badges.map((badge) => badge.id)).size;

  return { earned: Math.min(earned, total), ratio: Math.min(1, earned / total), total };
}

/**
 * Every catalog badge as a row, earned state resolved and progress attached.
 * The earned rows keep their stored tier; a locked row carries tier 0 even when
 * a counter is part-way to the first threshold, because a threshold that has
 * not been crossed is not a tier.
 */
export function buildOwnBadgeEntries(response: {
  readonly badges: readonly EarnedBadge[];
  readonly progress: readonly BadgeProgress[];
}): OwnBadgeEntry[] {
  const earnedById = new Map(response.badges.map((badge) => [badge.id, badge]));
  const progressById = new Map(response.progress.map((row) => [row.id, row]));

  return BADGE_IDS.map((id) => {
    const badge = earnedById.get(id) ?? null;
    const progress = progressById.get(id) ?? null;

    return {
      earned: badge !== null,
      ...(badge === null ? {} : { earnedAt: badge.earnedAt }),
      expiresAt: badge?.expiresAt ?? null,
      family: BADGE_CATALOG[id].family,
      id,
      progress: progress === null ? null : buildBadgeProgressDisplay(progress),
      tier: badge?.tier ?? 0,
    };
  });
}

export type BadgeFamilyGroup<T> = {
  readonly family: BadgeFamily;
  readonly badges: readonly T[];
};

/**
 * Groups rows under the family headings, in `BADGE_FAMILY_ORDER`, sorting each
 * group with the same `sortBadges` the chip row uses. Empty families are
 * dropped, so an "Etkinlik" heading never stands over nothing.
 */
export function groupBadgesByFamily<T extends SortableBadge>(
  badges: readonly T[],
): BadgeFamilyGroup<T>[] {
  const groups: BadgeFamilyGroup<T>[] = [];

  for (const family of BADGE_FAMILY_ORDER) {
    const members = sortBadges(badges.filter((badge) => BADGE_CATALOG[badge.id].family === family));
    if (members.length > 0) {
      groups.push({ badges: members, family });
    }
  }

  return groups;
}

/**
 * The badges an admin may hand out (08 §2). Everything else is earned: a badge
 * means the condition behind it happened, and a manually granted `streak` would
 * make every streak on the product unreadable.
 */
export const GRANTABLE_BADGE_IDS: readonly BadgeId[] = BADGE_IDS.filter(
  (id) => BADGE_CATALOG[id].layer === "granted",
);

/**
 * Rarity stays hidden below this many accounts (08 §4). On a small population a
 * percentage is both misleading — three holders out of two hundred reads as a
 * meaningful 1.5% — and a weak identifier: "0.4% of users" over a few hundred
 * accounts narrows a badge holder down to a handful of people.
 */
export const BADGE_RARITY_MIN_TOTAL_USERS = 500;

/** How long a fetched rarity summary stays fresh; the rollup runs daily. */
export const BADGE_RARITY_STALE_TIME_MS = 60 * 60 * 1000;

export type BadgeRarityDisplay =
  /** Population too small to say anything, or no summary computed yet. */
  | { readonly kind: "hidden" }
  /** Rounds to 0.0%: printed as "less than 1%" rather than as a zero. */
  | { readonly kind: "below-one" }
  | { readonly kind: "percent"; readonly percent: number };

/**
 * One decimal, and never a printed zero. The caller supplies the frame string
 * ("%N kullanıcıda") from its own dictionary; this decides only whether there is
 * a number to print and what it is (08 §4).
 */
export function resolveBadgeRarityDisplay(input: {
  readonly holders: number;
  readonly totalUsers: number;
}): BadgeRarityDisplay {
  const { holders, totalUsers } = input;

  if (totalUsers < BADGE_RARITY_MIN_TOTAL_USERS || holders <= 0) {
    return { kind: "hidden" };
  }

  const percent = Math.round((holders / totalUsers) * 1000) / 10;

  return percent < 0.1 ? { kind: "below-one" } : { kind: "percent", percent };
}

export const BadgeIdSchema = z.enum(BADGE_IDS);

export const EarnedBadgeSchema = z
  .object({
    id: BadgeIdSchema,
    tier: z.number().int().min(1).max(BADGE_MAX_TIER),
    earnedAt: z.string().datetime(),
    /** GRANTED rozetlerde dolu olabilir. */
    expiresAt: z.string().datetime().nullable().default(null),
  })
  .strict();

export const BadgeProgressSchema = z
  .object({
    id: BadgeIdSchema,
    tier: z.number().int().min(0).max(BADGE_MAX_TIER),
    value: z.number().int().min(0),
    nextThreshold: z.number().int().min(0).nullable(),
  })
  .strict();

export const UserBadgesResponseSchema = z
  .object({
    badges: z.array(EarnedBadgeSchema).max(BADGE_IDS.length),
  })
  .strict();

export const OwnBadgesResponseSchema = z
  .object({
    badges: z.array(EarnedBadgeSchema).max(BADGE_IDS.length),
    progress: z.array(BadgeProgressSchema).max(BADGE_IDS.length),
  })
  .strict();

export const BadgeRarityEntrySchema = z
  .object({
    id: BadgeIdSchema,
    /** Accounts holding the badge at any tier, revoked and expired excluded. */
    holders: z.number().int().min(0),
  })
  .strict();

/**
 * The rarity summary, deliberately its own endpoint rather than a field on the
 * badge responses: those schemas are frozen (03 §1) and a count is a different
 * kind of fact with a different refresh rate (08 §4).
 */
export const BadgeRarityResponseSchema = z
  .object({
    /** Null before the first nightly rollup has run. */
    computedAt: z.string().datetime().nullable(),
    /** Active accounts the percentages are measured against. */
    totalUsers: z.number().int().min(0),
    badges: z.array(BadgeRarityEntrySchema).max(BADGE_IDS.length),
  })
  .strict();

export type EarnedBadge = z.infer<typeof EarnedBadgeSchema>;
export type BadgeProgress = z.infer<typeof BadgeProgressSchema>;
export type UserBadgesResponse = z.infer<typeof UserBadgesResponseSchema>;
export type OwnBadgesResponse = z.infer<typeof OwnBadgesResponseSchema>;
export type BadgeRarityEntry = z.infer<typeof BadgeRarityEntrySchema>;
export type BadgeRarityResponse = z.infer<typeof BadgeRarityResponseSchema>;
