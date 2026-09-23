import { z } from "zod";

/**
 * Faz 1 (grup sohbetleri 2a–2f) §B2. Every rule in this file is enforced on both
 * the server and the two clients, so it lives here as a pure function rather
 * than beside whichever surface needed it first. §11.0/1 and 2c §2 own the two
 * palettes; nothing else may invent a colour.
 *
 * This module imports nothing from the package: `socket.ts` needs its schemas
 * for the conversation DTO and `group-dm.ts` needs its constants for the write
 * schemas, and either import back would close a cycle that leaves one of the
 * Zod objects undefined at module-evaluation time.
 */

/**
 * V1. Was 100; 2c §3's counter reads `18/32`. Existing longer names keep being
 * read — only writes are constrained.
 */
export const GROUP_DM_NAME_MAX_LENGTH = 32;

/** Sender-name colour, handed out per membership and fixed for its lifetime. */
export const GROUP_MEMBER_NAME_COLORS = [
  "#C2185B",
  "#C77A2B",
  "#1B8A55",
  "#8A46C7",
  "#4F46E5",
] as const;

/**
 * The six swatches the Mesajlar group-create modal offers (karar #4).
 *
 * These are **token names**, not colours. A hex list could not follow the app's
 * 23 palettes — a group created under one palette would keep the other palette's
 * indigo forever — and it put a raw `#4F46E5` in every component that drew a
 * group tile, which the token audit rejects.
 *
 * Resolution is the platform's job, because the two platforms resolve
 * differently: the web reads `hsl(var(--primary))` so the live palette applies,
 * while React Native has no CSS variables and reads
 * `GROUP_AVATAR_COLOR_HSL`. `info` and `accent` have no token in `globals.css`
 * and are the design's two approved literals on both sides.
 */
export const GROUP_AVATAR_COLORS = [
  "primary",
  "success",
  "warning",
  "danger",
  "info",
  "accent",
] as const;

/**
 * Reference HSL triples, for surfaces that cannot read a CSS variable.
 *
 * `primary` is the **default** palette's indigo; the web must not use this value
 * — it reads the live token instead, or a group tile stops following the user's
 * chosen palette. The other five are fixed across palettes.
 */
export const GROUP_AVATAR_COLOR_HSL = {
  primary: "235 86% 65%",
  success: "154 60% 42%",
  warning: "39 90% 56%",
  danger: "352 84% 60%",
  info: "199 89% 48%",
  accent: "291 64% 55%",
} as const;

/**
 * Which text colour reads on the swatch. The three light swatches take the
 * design's dark ink (`hsl(222 30% 14%)`); the rest take white.
 *
 * A tone rather than a colour: the caller owns the value, so this module keeps
 * carrying no colours it does not have to.
 */
export const GROUP_AVATAR_COLOR_TONE = {
  primary: "light",
  success: "dark",
  warning: "dark",
  danger: "light",
  info: "dark",
  accent: "light",
} as const;

/**
 * The five hex swatches this list used to hold, mapped onto the six names.
 *
 * `#1E2235` was the "no colour" slate and has no successor swatch; it resolves
 * to `primary`, which is what a fresh group draws. Existing rows are never
 * rewritten — the mapping happens on read, so a conversation nobody opens keeps
 * its stored value and a later reader still resolves it the same way.
 */
export const LEGACY_GROUP_AVATAR_COLOR_MAP = {
  "#4F46E5": "primary",
  "#1B8A55": "success",
  "#C77A2B": "warning",
  "#C2185B": "danger",
  "#1E2235": "primary",
} as const;

/** 2c §5 shows `0/120`. */
export const GROUP_DM_DESCRIPTION_MAX_LENGTH = 120;

/** One line of the pinned message, enough for 2d §2's strip and 2e §4's card. */
export const GROUP_PINNED_EXCERPT_MAX_LENGTH = 140;

/** 2d §1 draws two tiles and turns the second into `+N` past that. */
export const GROUP_AVATAR_TILE_COUNT = 2;

export type GroupMemberNameColor = (typeof GROUP_MEMBER_NAME_COLORS)[number];
export type GroupAvatarColor = (typeof GROUP_AVATAR_COLORS)[number];
export type GroupAvatarColorTone = (typeof GROUP_AVATAR_COLOR_TONE)[GroupAvatarColor];

export function isGroupAvatarColor(value: unknown): value is GroupAvatarColor {
  return typeof value === "string" && (GROUP_AVATAR_COLORS as readonly string[]).includes(value);
}

/**
 * Normalises whatever the database holds into a swatch name.
 *
 * Accepts a name (new rows), a known legacy hex (old rows, case-insensitive
 * because nothing ever forced the casing) and anything else — an unknown value
 * is a row from a future or corrupted write, and the first swatch is a better
 * answer than a tile with no colour at all.
 */
export function mapLegacyGroupAvatarColor(value: string | null | undefined): GroupAvatarColor {
  if (isGroupAvatarColor(value)) {
    return value;
  }

  const legacy = value?.trim().toUpperCase();
  if (legacy && legacy in LEGACY_GROUP_AVATAR_COLOR_MAP) {
    return LEGACY_GROUP_AVATAR_COLOR_MAP[legacy as keyof typeof LEGACY_GROUP_AVATAR_COLOR_MAP];
  }

  return GROUP_AVATAR_COLORS[0];
}

/** `"dark"` when the swatch is light enough to need dark ink on it. */
export function getGroupAvatarColorTone(color: GroupAvatarColor): GroupAvatarColorTone {
  return GROUP_AVATAR_COLOR_TONE[color];
}

/**
 * `hsl(...)` string for a platform with no CSS variables (React Native). The web
 * must not call this for `primary` — see `GROUP_AVATAR_COLOR_HSL`.
 */
export function getGroupAvatarColorHsl(color: GroupAvatarColor): string {
  return `hsl(${GROUP_AVATAR_COLOR_HSL[color]})`;
}

export const DMParticipantRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export const DMNotifyLevelSchema = z.enum(["ALL", "MENTIONS", "NONE"]);
export const GroupPermissionLevelSchema = z.enum(["ALL", "ADMINS"]);
export const GroupHistoryVisibilitySchema = z.enum([
  "NONE",
  "LAST_24H",
  "LAST_7D",
  "LAST_30D",
  "ALL",
]);
export const GroupAvatarColorSchema = z.enum(GROUP_AVATAR_COLORS);

/**
 * Read-side schema: accepts a stored legacy hex as well as a name and always
 * yields a name. Write paths keep using `GroupAvatarColorSchema`, so no new hex
 * can enter — only the ones already in the table come back out.
 */
export const StoredGroupAvatarColorSchema = z
  .string()
  .transform((value) => mapLegacyGroupAvatarColor(value));

/**
 * The four options the group-create screen draws, in the design's order
 * (karar #9). `LAST_24H` stays in the enum for conversations that already carry
 * it and for the group settings panel; the create screen simply does not offer
 * it.
 */
export const GROUP_CREATE_HISTORY_OPTIONS = ["ALL", "LAST_30D", "LAST_7D", "NONE"] as const;
/** K3 / 2f §4. The four windows the disappearing-messages row offers. */
export const GroupDisappearingWindowSchema = z.enum(["OFF", "H24", "D7", "D90"]);

export type DMParticipantRole = z.infer<typeof DMParticipantRoleSchema>;
export type DMNotifyLevel = z.infer<typeof DMNotifyLevelSchema>;
export type GroupPermissionLevel = z.infer<typeof GroupPermissionLevelSchema>;
export type GroupHistoryVisibility = z.infer<typeof GroupHistoryVisibilitySchema>;
export type GroupDisappearingWindow = z.infer<typeof GroupDisappearingWindowSchema>;

/** 2f §3's four rows, in the order the screen lists them. */
export type GroupAction = "sendMessage" | "addMembers" | "editInfo" | "pinMessage";

export const GroupPermissionsSchema = z.object({
  sendMessage: GroupPermissionLevelSchema,
  addMembers: GroupPermissionLevelSchema,
  editInfo: GroupPermissionLevelSchema,
  pinMessage: GroupPermissionLevelSchema,
});

export type GroupPermissions = z.infer<typeof GroupPermissionsSchema>;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * V2. The least-used colour wins so a 6-person group never shows two members in
 * the same colour while a colour sits unused; palette order breaks the tie, so
 * a replay of the same joins produces the same assignment on any server.
 */
export function pickNextMemberNameColor(usedColors: readonly string[]): GroupMemberNameColor {
  const counts = new Map<GroupMemberNameColor, number>(
    GROUP_MEMBER_NAME_COLORS.map((color) => [color, 0]),
  );

  for (const used of usedColors) {
    const count = counts.get(used as GroupMemberNameColor);
    // A colour outside the palette (an older row, a hand-edited value) is not a
    // vote against any palette entry.
    if (count !== undefined) {
      counts.set(used as GroupMemberNameColor, count + 1);
    }
  }

  let best: GroupMemberNameColor = GROUP_MEMBER_NAME_COLORS[0];
  let bestCount = counts.get(best) ?? 0;

  for (const color of GROUP_MEMBER_NAME_COLORS) {
    const count = counts.get(color) ?? 0;
    // Strictly less: a tie leaves the earlier palette entry in place.
    if (count < bestCount) {
      best = color;
      bestCount = count;
    }
  }

  return best;
}

/** 2f §3. `ALL` is everybody; `ADMINS` is the owner and the admins. */
export function canMemberDo(role: DMParticipantRole, level: GroupPermissionLevel): boolean {
  if (level === "ALL") {
    return true;
  }

  return role === "OWNER" || role === "ADMIN";
}

/**
 * What 2f §2's middle option actually promises: "@adın geçtiğinde ve
 * yanıtlarda". Both halves matter — a reply to your message is the other way a
 * conversation asks for you by name, and dropping it would make `MENTIONS`
 * silent for the most common form of being addressed.
 */
export interface DMNotificationTrigger {
  readonly isMentioned: boolean;
  readonly isReplyToViewer: boolean;
}

/**
 * The one place the three notification tiers turn into a yes/no. Lives here
 * rather than beside the fan-out because the inbox badge, the push sender and
 * the call ring all have to agree with the row the user tapped in 2f.
 */
export function shouldNotifyForDMMessage(
  notifyLevel: DMNotifyLevel,
  trigger: DMNotificationTrigger,
): boolean {
  switch (notifyLevel) {
    case "NONE":
      return false;
    case "MENTIONS":
      return trigger.isMentioned || trigger.isReplyToViewer;
    case "ALL":
      return true;
  }
}

export interface GroupCapabilities {
  readonly canAddMembers: boolean;
  readonly canEditInfo: boolean;
  readonly canManageRoles: boolean;
  readonly canPin: boolean;
  readonly canSend: boolean;
  readonly canTransferOwnership: boolean;
}

/**
 * Faz 5 §D3 / §H. One question per control, asked once for the whole product:
 * mobile's 2e/2f and the web panels call this, so a permission cannot mean two
 * things on two clients. Written here rather than in either app for exactly that
 * reason.
 *
 * No `permissions` means a 1:1 conversation, where the server's own gate always
 * passes; the two role controls stay off because a 1:1 has no roles to manage.
 */
export function getGroupCapabilities(
  role: DMParticipantRole | undefined,
  permissions: GroupPermissions | undefined,
): GroupCapabilities {
  const isOwner = role === "OWNER";

  if (!permissions) {
    return {
      canAddMembers: true,
      canEditInfo: true,
      canManageRoles: false,
      canPin: true,
      canSend: true,
      canTransferOwnership: false,
    };
  }

  const effectiveRole = role ?? "MEMBER";

  return {
    canAddMembers: canMemberDo(effectiveRole, permissions.addMembers),
    canEditInfo: canMemberDo(effectiveRole, permissions.editInfo),
    canManageRoles: isOwner,
    canPin: canMemberDo(effectiveRole, permissions.pinMessage),
    canSend: canMemberDo(effectiveRole, permissions.sendMessage),
    canTransferOwnership: isOwner,
  };
}

export type GroupMemberAction = "demote" | "message" | "profile" | "promote" | "remove";

/**
 * 2e §7 / §D3.3, in the order both clients list them. C5 is binding on web as
 * well as on mobile: an action the viewer may not take is **absent**, never
 * greyed out — a disabled "Gruptan çıkar" tells a member the control exists and
 * only the click is missing.
 *
 * Your own row offers nothing: "message" and "profile" are about somebody else,
 * and the moderation half cannot target yourself (leaving has its own control).
 */
export function getGroupMemberActions(
  viewerRole: DMParticipantRole | undefined,
  targetRole: DMParticipantRole | undefined,
  isSelf: boolean,
): GroupMemberAction[] {
  if (isSelf) {
    return [];
  }

  const actions: GroupMemberAction[] = ["message", "profile"];

  // The owner is not a moderation target: the group changes hands through the
  // explicit transfer, never by demoting or removing whoever holds it.
  if (targetRole === "OWNER") {
    return actions;
  }

  if (viewerRole === "OWNER") {
    actions.push(targetRole === "ADMIN" ? "demote" : "promote", "remove");
    return actions;
  }

  // An admin moderates members only; two admins are peers, so neither can act
  // on the other — that is the owner's call.
  if (viewerRole === "ADMIN" && targetRole !== "ADMIN") {
    actions.push("remove");
  }

  return actions;
}

/**
 * 2c §7. The oldest message a member who joined at `joinedAt` may read. `null`
 * means "no floor" so the caller writes no `where` clause at all rather than a
 * clause that always matches.
 */
export function resolveHistoryFloor(
  visibility: GroupHistoryVisibility,
  joinedAt: Date,
): Date | null {
  switch (visibility) {
    case "NONE":
      return new Date(joinedAt.getTime());
    case "LAST_24H":
      return new Date(joinedAt.getTime() - DAY_MS);
    case "LAST_7D":
      return new Date(joinedAt.getTime() - 7 * DAY_MS);
    case "LAST_30D":
      return new Date(joinedAt.getTime() - 30 * DAY_MS);
    case "ALL":
      return null;
  }
}

/**
 * K3 / C2. The deadline a message written at `sentAt` carries, or `null` when
 * the conversation's window is off. Taking the instant as an argument rather
 * than reading the clock is what makes V6 enforceable: the stamp belongs to the
 * message, so a later window change cannot reach backwards and re-date it.
 */
export function resolveDisappearingExpiry(
  window: GroupDisappearingWindow,
  sentAt: Date,
): Date | null {
  switch (window) {
    case "OFF":
      return null;
    case "H24":
      return new Date(sentAt.getTime() + DAY_MS);
    case "D7":
      return new Date(sentAt.getTime() + 7 * DAY_MS);
    case "D90":
      return new Date(sentAt.getTime() + 90 * DAY_MS);
  }
}

/**
 * V1. Measured on the trimmed name with `String.length`, which is what the write
 * schema and the `maxLength` attribute both count — a function that counted code
 * points would disagree with the input the user is typing into.
 */
export function isGroupNameWithinLimit(name: string): boolean {
  return name.trim().length <= GROUP_DM_NAME_MAX_LENGTH;
}

/**
 * Fallback tile letters. `tr` casing on purpose: `i`.toUpperCase() is `I` in the
 * default locale, and a Turkish name rendered as `IREM` is a spelling error the
 * whole app would carry.
 */
export function toGroupAvatarInitials(user: {
  readonly displayName: string | null;
  readonly username: string;
}): string {
  const source = user.displayName?.trim() ? user.displayName : user.username;
  const words = source.trim().split(/\s+/).filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("");

  return letters.length > 0 ? letters.toLocaleUpperCase("tr") : "?";
}

export type GroupAvatarTile = {
  readonly accent: string;
  readonly avatarUrl: string | null;
  readonly initials: string;
  readonly userId: string;
};

export type GroupAvatarPair = {
  readonly overflowCount: number;
  readonly tiles: GroupAvatarTile[];
};

/**
 * Faz 3. The tile as it travels on a payload. Declared here beside the builder
 * rather than in `mobile.ts` so the mobile inbox row and the conversation DTO
 * cannot drift into two shapes of the same tile.
 */
export const GroupAvatarTileSchema: z.ZodType<GroupAvatarTile> = z.object({
  accent: z.string().max(32),
  avatarUrl: z.string().max(2048).nullable(),
  initials: z.string().max(4),
  userId: z.string().max(128),
});

export type GroupAvatarSourceParticipant = {
  readonly avatarUrl: string | null;
  readonly displayName: string | null;
  readonly joinedAt: string;
  readonly nameColor?: string | null | undefined;
  readonly userId: string;
  readonly username: string;
};

/**
 * V7 / §11.0.7. The crossed pair a group row and a group header draw: the first
 * two *other* members by join order, and the count of everyone they hide. The
 * viewer is excluded because a tile of yourself appears on every row you are in.
 *
 * Sorting is done on a copy — the caller's array is the conversation projection
 * and other readers depend on its order.
 */
export function buildGroupAvatarPair(
  participants: readonly GroupAvatarSourceParticipant[],
  viewerId: string,
): GroupAvatarPair {
  const others = [...participants]
    .filter((participant) => participant.userId !== viewerId)
    .sort((left, right) => {
      const byJoinedAt = left.joinedAt.localeCompare(right.joinedAt);
      return byJoinedAt !== 0 ? byJoinedAt : left.userId.localeCompare(right.userId);
    });

  const tiles = others.slice(0, GROUP_AVATAR_TILE_COUNT).map((participant, index) => ({
    // A row written before the colour column existed still has to draw a tile,
    // so the palette position stands in rather than a blank swatch.
    accent:
      participant.nameColor ??
      GROUP_MEMBER_NAME_COLORS[index % GROUP_MEMBER_NAME_COLORS.length] ??
      GROUP_MEMBER_NAME_COLORS[0],
    avatarUrl: participant.avatarUrl,
    initials: toGroupAvatarInitials(participant),
    userId: participant.userId,
  }));

  return { overflowCount: Math.max(0, others.length - tiles.length), tiles };
}

const GroupDescriptionSchema = z
  .string()
  .max(GROUP_DM_DESCRIPTION_MAX_LENGTH)
  .transform((value) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

/**
 * 2f §3 + 2c §5/§7. A partial patch: an absent key means "leave it alone", which
 * is why nothing here has a default. An entirely empty body is rejected rather
 * than treated as a no-op — it can only come from a client bug, and answering
 * `200` to it would hide the bug behind a successful write.
 */
export const GroupDMSettingsUpdateRequestSchema = z
  .object({
    avatarColor: GroupAvatarColorSchema.nullable().optional(),
    description: GroupDescriptionSchema.nullable().optional(),
    /**
     * K3. The one key in this patch that leaves a system row behind — the rest
     * are silent configuration. See `updateGroupSettings`.
     */
    disappearingAfter: GroupDisappearingWindowSchema.optional(),
    historyVisibility: GroupHistoryVisibilitySchema.optional(),
    permAddMembers: GroupPermissionLevelSchema.optional(),
    permEditInfo: GroupPermissionLevelSchema.optional(),
    permPinMessage: GroupPermissionLevelSchema.optional(),
    permSendMessage: GroupPermissionLevelSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "At least one setting must be supplied",
  );

export type GroupDMSettingsUpdateRequest = z.infer<typeof GroupDMSettingsUpdateRequestSchema>;

/**
 * 2e §7. Two different writes behind one endpoint, kept apart by the union so a
 * body can never ask for both: promoting somebody is a role write, handing the
 * group over moves `ownerId` and demotes the old owner.
 *
 * `OWNER` is deliberately not a settable role — a group has exactly one, and it
 * only changes through the transfer branch.
 */
export const GroupMemberRoleUpdateRequestSchema = z.union([
  z.object({ transferOwnership: z.literal(true) }).strict(),
  z
    .object({
      role: z.enum(["ADMIN", "MEMBER"]),
      transferOwnership: z.literal(false).optional(),
    })
    .strict(),
]);

export type GroupMemberRoleUpdateRequest = z.infer<typeof GroupMemberRoleUpdateRequestSchema>;

/** 2f §2. Per-participant, so it needs no permission. */
export const ConversationNotifyRequestSchema = z
  .object({ notifyLevel: DMNotifyLevelSchema })
  .strict();

/** V3 / 2a §2. Also per-participant, and valid on a 1:1 DM. */
export const ConversationPinRequestSchema = z.object({ pinned: z.boolean() }).strict();

/** 2d §2 / 2e §4. */
export const GroupPinMessageRequestSchema = z
  .object({ messageId: z.string().trim().min(1).max(128) })
  .strict();

/**
 * 2d §2, "kapatma yalnız o kullanıcı için gizler". The id is required: a
 * dismissal that just said "hide the strip" would also hide the next pin, which
 * the dismisser has never seen.
 */
export const GroupPinDismissRequestSchema = GroupPinMessageRequestSchema;
