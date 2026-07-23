import type { MobileUserProfile } from "../mobile-social-client";
import { getMobileIntlLocale, type MobileLocale } from "../../locale/mobile-locale-preferences";
import type { mobileCopy } from "../../locale/mobile-copy";

export type MobileProfileCopy = (typeof mobileCopy)[MobileLocale];

/**
 * Which page the 1c layout renders. `blocked` keeps the restricted page the
 * card uses, `self` swaps the action row for "Profili düzenle", and `peer`
 * carries the 1b button set (add friend + message).
 */
export type MobileProfilePageVariant = "blocked" | "friend" | "peer" | "self";

export interface MobileProfileMutualServerRow {
  readonly iconUrl: string | null;
  readonly id: string;
  readonly memberCount: number;
  readonly name: string;
  /**
   * The profiled user's top role there. 11a only carries roles for the server
   * the page was opened from, so every other row reads out the member count
   * alone until `mutualServers.preview[].peerRoleName` exists.
   */
  readonly peerRoleName: string | null;
  readonly shortName: string | null;
}

export interface MobileProfilePageSections {
  readonly about: {
    readonly bio: string | null;
    readonly joinedServerAt: string | null;
    readonly serverName: string | null;
    readonly registeredAt: string;
    readonly visible: boolean;
  };
  readonly mutualFriends: {
    readonly count: number;
    readonly preview: MobileUserProfile["mutualFriends"]["preview"];
    readonly visible: boolean;
  };
  readonly mutualServers: {
    readonly count: number;
    readonly rows: readonly MobileProfileMutualServerRow[];
    readonly visible: boolean;
  };
  readonly note: {
    readonly value: string | null;
    readonly visible: boolean;
  };
  readonly roles: {
    readonly items: NonNullable<MobileUserProfile["serverContext"]>["roles"];
    readonly visible: boolean;
  };
  readonly variant: MobileProfilePageVariant;
}

export function getMobileProfilePageVariant(profile: MobileUserProfile): MobileProfilePageVariant {
  if (profile.blocked || profile.blockedBy) {
    return "blocked";
  }
  if (profile.self) {
    return "self";
  }
  return profile.relationship === "friend" ? "friend" : "peer";
}

/**
 * Section visibility for the 1c page. Empty sections disappear instead of
 * rendering a hollow card, and a blocked profile keeps identity only.
 */
export function buildMobileProfilePageSections(
  profile: MobileUserProfile,
): MobileProfilePageSections {
  const variant = getMobileProfilePageVariant(profile);
  const restricted = variant === "blocked";
  const serverContext = profile.serverContext;
  const mutualServerRows = profile.mutualServers.preview.map((server) => ({
    iconUrl: server.iconUrl,
    id: server.id,
    memberCount: server.memberCount,
    name: server.name,
    peerRoleName:
      serverContext && serverContext.serverId === server.id
        ? (serverContext.roles[0]?.name ?? null)
        : null,
    shortName: server.shortName,
  }));

  return {
    about: {
      bio: restricted ? null : profile.bio,
      joinedServerAt: restricted ? null : (serverContext?.joinedAt ?? null),
      registeredAt: profile.registeredAt,
      serverName: restricted ? null : (serverContext?.serverName ?? null),
      // Registration date is always known, so ABOUT survives an empty bio.
      visible: !restricted,
    },
    mutualFriends: {
      count: profile.mutualFriends.count,
      preview: profile.mutualFriends.preview,
      visible: !restricted && profile.mutualFriends.count > 0,
    },
    mutualServers: {
      count: profile.mutualServers.count,
      rows: mutualServerRows,
      visible: !restricted && mutualServerRows.length > 0,
    },
    note: {
      value: restricted ? null : profile.note,
      // Your own profile has nobody to write a private note about.
      visible: !restricted && !profile.self,
    },
    roles: {
      items: serverContext?.roles ?? [],
      // 1a/1c: role chips are a server-context fact, never shown from a DM.
      visible: !restricted && (serverContext?.roles.length ?? 0) > 0,
    },
    variant,
  };
}

/** `#RRGGBB` for a stored Discord-style integer role color; null keeps the token default. */
export function getMobileProfileRoleColor(color: number): string | null {
  if (!Number.isInteger(color) || color <= 0 || color > 0xffffff) {
    return null;
  }
  return `#${color.toString(16).padStart(6, "0")}`;
}

const TURKISH_BACK_VOWELS = "aıou";
const TURKISH_FRONT_VOWELS = "eiöü";

/**
 * Turkish locative for a year read as a numeral ("2024'te", "2026'da"). Only the
 * last spoken word matters, so the last digit decides — or the tens digit when
 * the year ends in zero.
 */
export function getTurkishYearLocativeSuffix(year: number): string {
  const lastDigit = Math.abs(Math.trunc(year)) % 10;
  if (lastDigit !== 0) {
    return (
      {
        1: "'de",
        2: "'de",
        3: "'te",
        4: "'te",
        5: "'te",
        6: "'da",
        7: "'de",
        8: "'de",
        9: "'da",
      }[lastDigit] ?? "'de"
    );
  }

  const tens = Math.floor(Math.abs(Math.trunc(year)) / 10) % 10;
  return (
    {
      0: "'de",
      1: "'da",
      2: "'de",
      3: "'da",
      4: "'ta",
      5: "'de",
      6: "'ta",
      7: "'te",
      8: "'de",
      9: "'da",
    }[tens] ?? "'de"
  );
}

/** Turkish dative for a name ("UAT ENV'e", "Ada'ya"); vowel harmony plus the y buffer. */
export function getTurkishDativeSuffix(name: string): string {
  const normalized = name.trim().toLocaleLowerCase("tr-TR");
  let lastVowel = "";
  for (const character of normalized) {
    if (TURKISH_BACK_VOWELS.includes(character) || TURKISH_FRONT_VOWELS.includes(character)) {
      lastVowel = character;
    }
  }

  const base = TURKISH_BACK_VOWELS.includes(lastVowel) ? "a" : "e";
  const endsWithVowel =
    normalized.length > 0 &&
    (TURKISH_BACK_VOWELS.includes(normalized[normalized.length - 1] ?? "") ||
      TURKISH_FRONT_VOWELS.includes(normalized[normalized.length - 1] ?? ""));

  return endsWithVowel ? `'y${base}` : `'${base}`;
}

/** "Mayıs 2024" / "May 2024" — month name and year, never a day. */
export function formatMobileProfileMonthYear(value: string, locale: MobileLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const month = new Intl.DateTimeFormat(getMobileIntlLocale(locale), { month: "long" }).format(
    date,
  );
  return `${month} ${date.getFullYear()}`;
}

function formatMobileProfileMonthYearWithSuffix(value: string, locale: MobileLocale): string {
  const formatted = formatMobileProfileMonthYear(value, locale);
  if (!formatted || locale !== "tr") {
    return formatted;
  }
  return `${formatted}${getTurkishYearLocativeSuffix(new Date(value).getFullYear())}`;
}

/** "Mayıs 2024'te Whispr'a katıldı" / "Joined Whispr in May 2024". */
export function formatMobileProfileWhisprJoin(
  value: string,
  locale: MobileLocale,
  copy: MobileProfileCopy,
): string {
  const date = formatMobileProfileMonthYearWithSuffix(value, locale);
  return date ? copy.profilePageJoinedWhispr.replace("{date}", date) : "";
}

/** "Şubat 2025'te UAT ENV'e katıldı" / "Joined UAT ENV in February 2025". */
export function formatMobileProfileServerJoin(
  value: string,
  serverName: string,
  locale: MobileLocale,
  copy: MobileProfileCopy,
): string {
  const date = formatMobileProfileMonthYearWithSuffix(value, locale);
  if (!date) {
    return "";
  }

  const server = locale === "tr" ? `${serverName}${getTurkishDativeSuffix(serverName)}` : serverName;
  return copy.profilePageJoinedServer.replace("{date}", date).replace("{server}", server);
}

function getMobileProfileFriendLabel(friend: {
  readonly displayName: string | null;
  readonly username: string;
}): string {
  return friend.displayName?.trim() || friend.username;
}

/**
 * "ogi_uat, mkaya, elifay ve 2 kişi daha" — the first three names, then the
 * remainder as a count. Under four mutuals it is a plain list.
 */
export function formatMobileProfileMutualFriendsSummary(
  mutualFriends: MobileUserProfile["mutualFriends"],
  copy: MobileProfileCopy,
): string {
  const names = mutualFriends.preview.map(getMobileProfileFriendLabel);
  if (names.length === 0) {
    return "";
  }

  const leading = names.slice(0, 3);
  const remaining = Math.max(0, mutualFriends.count - leading.length);
  if (remaining === 0) {
    return leading.join(", ");
  }

  return copy.profilePageMutualFriendsSummary
    .replace("{names}", leading.join(", "))
    .replace("{count}", String(remaining));
}

/** "128 üye · Geliştirici" — the role half disappears when 11a has no role for that server. */
export function formatMobileProfileMutualServerSubtitle(
  row: MobileProfileMutualServerRow,
  copy: MobileProfileCopy,
): string {
  const members = copy.profilePageMemberCount.replace("{count}", String(row.memberCount));
  return row.peerRoleName ? `${members} · ${row.peerRoleName}` : members;
}

/** Overflow badge for the stacked mutual-friend avatars ("+2"), empty when nothing spills. */
export function getMobileProfileMutualFriendsOverflow(
  mutualFriends: MobileUserProfile["mutualFriends"],
  visibleCount: number,
): number {
  return Math.max(0, mutualFriends.count - Math.min(visibleCount, mutualFriends.preview.length));
}

export interface MobileProfileConversationCandidate {
  readonly id: string;
  readonly participants: readonly { readonly id: string }[];
  readonly type: "DM" | "GROUP_DM";
}

/**
 * The shared-media section reads an existing 1:1 conversation from the DM list
 * cache. It never creates one — a profile visit must not open a DM.
 */
export function findMobileProfileDirectConversationId(
  conversations: readonly MobileProfileConversationCandidate[],
  peerUserId: string,
): string | null {
  const match = conversations.find(
    (conversation) =>
      conversation.type === "DM" &&
      conversation.participants.some((participant) => participant.id === peerUserId),
  );

  return match?.id ?? null;
}
