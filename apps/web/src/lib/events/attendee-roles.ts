import type { EventAttendee, EventAttendeeRole } from "@wizards/types";

/**
 * Etkinlikler Ş2 §2 — katılımcı rolü **tek yerde** çözülür.
 *
 * Bir kişi listede tek satırda durur. Aynı kişi hem `GOING` RSVP'si hem canlı `VoiceState`
 * satırı taşıyabilir; hangisinin gösterileceği bir görünüm tercihi değil, bir veri kararıdır:
 * canlı olan bilgi daha tazedir, bu yüzden `listening` kazanır.
 *
 * Modül **saf**: veritabanı, saat ve istek bilmez. Sunucu ve olası ikinci tüketici (mobil)
 * aynı sırayı okur; sıralama iki yerde yaşasaydı bir gün ayrışırdı ve aynı etkinlikte iki
 * istemci farklı rol pili çizerdi.
 */

/** SPEC §5.3 — sıra da öncelik de budur. Dizinin **sırası** anlam taşır. */
export const EVENT_ATTENDEE_ROLE_ORDER = ["host", "listening", "going", "maybe"] as const;

/** Ş2 §2 — ilk sayfa 8 kişi; kalanı `attendeeMoreCount` sayar. */
export const EVENT_ATTENDEE_PAGE_SIZE = 8;

const ROLE_RANK: Readonly<Record<EventAttendeeRole, number>> = Object.freeze(
  Object.fromEntries(EVENT_ATTENDEE_ROLE_ORDER.map((role, index) => [role, index])) as Record<
    EventAttendeeRole,
    number
  >,
);

export function eventAttendeeRoleRank(role: EventAttendeeRole): number {
  return ROLE_RANK[role];
}

export type EventAttendeeCandidate = {
  readonly avatarUrl: string | null;
  readonly displayName: string | null;
  /** Kullanıcı kimliği — tekillik bunun üzerinden kurulur. */
  readonly id: string;
  readonly role: EventAttendeeRole;
  /** Grup içi sıra: RSVP satırının `createdAt`i, dinleyicide `joinedAt`. */
  readonly sortAt: Date;
  readonly username: string;
};

/**
 * `EventAttendee.name` — görünen ad boşsa kullanıcı adı. Boşluktan ibaret bir `displayName`
 * de boştur; aksi hâlde listede adsız bir satır çıkar.
 */
export function toEventAttendeeName(source: {
  readonly displayName: string | null;
  readonly username: string;
}): string {
  return source.displayName?.trim() || source.username;
}

/**
 * Avatar boşken çizilen baş harfler. Şema en az bir karakter istiyor, bu yüzden fonksiyon
 * hiçbir girdide boş dönmez: adsız bir satır panelin tamamını şemadan düşürürdü.
 */
export function toEventInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => [...part][0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("");

  return initials.length > 0 ? initials : "?";
}

function toAttendee(candidate: EventAttendeeCandidate): EventAttendee {
  const name = toEventAttendeeName(candidate);

  return {
    avatarUrl: candidate.avatarUrl,
    id: candidate.id,
    initials: toEventInitials(name),
    name,
    role: candidate.role,
  };
}

/**
 * Sıralama anahtarı: rol sırası → grup içi zaman → kimlik. Kimlik yalnız bir bağ çözücü,
 * ama imleç için zorunlu: aynı saniyede yazılmış iki RSVP arasında kararsız bir sıra,
 * ikinci sayfada tekrar eden ya da atlanan bir satır demektir.
 */
export type EventAttendeeKey = {
  readonly id: string;
  readonly rank: number;
  readonly sortAt: string;
};

export function compareEventAttendeeKeys(left: EventAttendeeKey, right: EventAttendeeKey): number {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }

  if (left.sortAt !== right.sortAt) {
    return left.sortAt < right.sortAt ? -1 : 1;
  }

  return left.id === right.id ? 0 : left.id < right.id ? -1 : 1;
}

export function eventAttendeeKey(candidate: EventAttendeeCandidate): EventAttendeeKey {
  return {
    id: candidate.id,
    rank: eventAttendeeRoleRank(candidate.role),
    sortAt: candidate.sortAt.toISOString(),
  };
}

export function encodeEventAttendeeCursor(key: {
  readonly id: string;
  readonly rank: number;
  readonly sortAt: Date | string;
}): string {
  const sortAt = typeof key.sortAt === "string" ? key.sortAt : key.sortAt.toISOString();
  return Buffer.from(`${key.rank}|${sortAt}|${key.id}`, "utf8").toString("base64url");
}

/** Adres çubuğundan gelen değer; tanınmayan her şey `null` olur ve sayfa baştan başlar. */
export function decodeEventAttendeeCursor(raw: string | null | undefined): EventAttendeeKey | null {
  if (!raw) {
    return null;
  }

  const [rawRank, sortAt, ...rest] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const id = rest.join("|");
  const rank = Number(rawRank);

  if (!sortAt || id.length === 0) {
    return null;
  }

  if (!Number.isInteger(rank) || rank < 0 || rank >= EVENT_ATTENDEE_ROLE_ORDER.length) {
    return null;
  }

  return Number.isNaN(new Date(sortAt).getTime()) ? null : { id, rank, sortAt };
}

/**
 * Adayları tek satıra indirger ve sıraya dizer.
 *
 * Girdi sırası sonucu **etkilemez**: aynı kişi için iki aday geldiğinde kazananı rol önceliği
 * seçer, hangisinin önce geldiği değil.
 */
export function resolveEventAttendees(
  candidates: readonly EventAttendeeCandidate[],
): EventAttendee[] {
  const byUserId = new Map<string, EventAttendeeCandidate>();

  for (const candidate of candidates) {
    const current = byUserId.get(candidate.id);

    if (
      !current ||
      eventAttendeeRoleRank(candidate.role) < eventAttendeeRoleRank(current.role) ||
      (candidate.role === current.role &&
        compareEventAttendeeKeys(eventAttendeeKey(candidate), eventAttendeeKey(current)) < 0)
    ) {
      byUserId.set(candidate.id, candidate);
    }
  }

  return [...byUserId.values()]
    .sort((left, right) =>
      compareEventAttendeeKeys(eventAttendeeKey(left), eventAttendeeKey(right)),
    )
    .map(toAttendee);
}
