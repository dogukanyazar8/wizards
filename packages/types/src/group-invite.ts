import { z } from "zod";

/**
 * Grup sohbetleri 2a–2f, Faz 2 §B. Everything about a group invite link that
 * both the server and the two clients have to agree on: the code's shape, the
 * order the join checks run in, and how a code becomes a shareable link.
 *
 * Leaf module — imports nothing from the package, for the same reason
 * `group-dm-settings.ts` does not: `socket.ts` carries the invite DTO on the
 * conversation payload, and an import back would close a cycle that leaves one
 * of the Zod objects undefined at module-evaluation time.
 */

/**
 * Longer than `ServerInvite.code` (8) because a group link is pasted into open
 * chats far more often than a server link is, and the extra four characters
 * cost nothing while multiplying the guess space by ~10^6.
 */
export const GROUP_INVITE_CODE_LENGTH = 12;

/**
 * The same unambiguous alphabet `generateInviteCode` already uses: no I, O, 0
 * or 1, so a code read aloud or retyped from a screenshot survives.
 */
export const INVITE_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * §B4. Server invites own `/invite/<code>`; a group link is `/g/<code>` so the
 * two never collide in the deep-link router.
 */
export const GROUP_INVITE_PATH_PREFIX = "/g/";

const GROUP_INVITE_CODE_PATTERN = new RegExp(
  `^[${INVITE_CODE_CHARSET}]{${GROUP_INVITE_CODE_LENGTH}}$`,
);

/**
 * Cheap shape check before the database is asked anything. A code that cannot
 * exist is a 404 without a query, which is what keeps a scripted guessing run
 * off the connection pool.
 */
export function isGroupInviteCode(value: string): boolean {
  return GROUP_INVITE_CODE_PATTERN.test(value);
}

/** K2: the toggle is the whole request. The code is never client-supplied. */
export const GroupInviteSettingsRequestSchema = z.object({ enabled: z.boolean() }).strict();

export type GroupInviteSettingsRequest = z.infer<typeof GroupInviteSettingsRequestSchema>;

/** Why an invite row itself cannot be used, independent of who is asking. */
export type GroupInviteBlockReason = "disabled" | "expired" | "exhausted";

/** Adds the two reasons that depend on the caller and the group's state. */
export type GroupInviteJoinBlockReason = GroupInviteBlockReason | "full" | "blocked";

export type GroupInviteState = {
  readonly enabled: boolean;
  readonly expiresAt: Date | string | null;
  readonly maxUses: number | null;
  readonly uses: number;
};

function toEpochMillis(value: Date | string | null): number | null {
  if (value === null) {
    return null;
  }

  const millis = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(millis) ? null : millis;
}

/**
 * Steps 2–4 of B2's join order, as one pure decision so the HTTP route, the
 * preview and the web page cannot disagree about which reason wins. Returns
 * `null` when the invite row itself is usable — the caller still has to answer
 * the questions that need the group (membership, capacity, blocks).
 *
 * The order matters and is not alphabetical: a disabled invite must report
 * "disabled" even when it is also expired, because otherwise the answer tells a
 * stranger that a link *was* real.
 */
export function resolveGroupInviteBlock(
  invite: GroupInviteState,
  now: Date,
): GroupInviteBlockReason | null {
  if (!invite.enabled) {
    return "disabled";
  }

  const expiresAt = toEpochMillis(invite.expiresAt);
  // Strictly past: an invite whose deadline is this very instant is still live,
  // which is the same boundary the ring timeout and the history floor use.
  if (expiresAt !== null && expiresAt < now.getTime()) {
    return "expired";
  }

  if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
    return "exhausted";
  }

  return null;
}

/**
 * §B4. The shareable link. `origin` is the deployment's own runtime origin —
 * `whispr.gg/g/mobil-ekibi` in the design is an example, never a constant — so a
 * deployment without one loses the link rather than minting a wrong host.
 */
export function buildGroupInviteUrl(origin: URL | string | null, code: string): string | null {
  if (!origin || !code) {
    return null;
  }

  try {
    return new URL(`${GROUP_INVITE_PATH_PREFIX}${code}`, origin).toString();
  } catch {
    return null;
  }
}

/** The same link as a person reads it: no scheme, no trailing slash. */
export function buildGroupInviteDisplayUrl(host: string | null, code: string): string | null {
  if (!host || !code) {
    return null;
  }

  return `${host}${GROUP_INVITE_PATH_PREFIX}${code}`;
}

/**
 * What the settings surface draws. `code` and the two links are null while the
 * invite is off (E2: "kapalı davet = kod yok"), so a disabled row has nothing to
 * leak even if a client renders it anyway.
 */
export interface GroupInviteDTO {
  enabled: boolean;
  code: string | null;
  url: string | null;
  displayUrl: string | null;
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
  rotatedAt: string | null;
}

export const GroupInviteDTOSchema: z.ZodType<GroupInviteDTO> = z.object({
  enabled: z.boolean(),
  code: z.string().nullable(),
  url: z.string().nullable(),
  displayUrl: z.string().nullable(),
  uses: z.number().int().nonnegative(),
  maxUses: z.number().int().positive().nullable(),
  expiresAt: z.string().nullable(),
  rotatedAt: z.string().nullable(),
});

export const GroupInviteResponseSchema = z.object({ invite: GroupInviteDTOSchema }).strict();

/**
 * B2's preview. Deliberately not a conversation DTO: the caller is a stranger
 * to this group, and the member list is exactly what they must not receive.
 */
export interface GroupInvitePreviewDTO {
  code: string;
  name: string | null;
  iconUrl: string | null;
  avatarColor: string | null;
  memberCount: number;
  joinable: boolean;
  reason: GroupInviteJoinBlockReason | null;
  /** True when the caller is already inside; step 5 of B2 is a success, not an error. */
  alreadyMember: boolean;
}

export const GroupInvitePreviewDTOSchema: z.ZodType<GroupInvitePreviewDTO> = z.object({
  code: z.string(),
  name: z.string().nullable(),
  iconUrl: z.string().nullable(),
  avatarColor: z.string().nullable(),
  memberCount: z.number().int().nonnegative(),
  joinable: z.boolean(),
  reason: z.enum(["disabled", "expired", "exhausted", "full", "blocked"]).nullable(),
  alreadyMember: z.boolean(),
});

export const GroupInvitePreviewResponseSchema = z
  .object({ preview: GroupInvitePreviewDTOSchema })
  .strict();

/**
 * The join answer. It carries `alreadyMember` beside the conversation, which the
 * strict `GroupDMConversationResponseSchema` rejects — so the body gets its own
 * schema here rather than each client hand-reading the flag off a raw payload.
 *
 * `conversation` stays loosely typed on purpose: this module imports nothing
 * from the package (see the header), and the DTO's own schema lives in
 * `socket.ts`, which would close a cycle. The caller parses it with
 * `DMConversationDTOSchema` after this check has passed.
 */
export const GroupInviteJoinResponseSchema = z
  .object({ alreadyMember: z.boolean(), conversation: z.unknown() })
  .strict();
