import { z } from "zod";

export type FriendStatusDto = "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED";

export type FriendPresenceStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";
export type FriendErrorCode = "ALREADY_FRIENDS" | "BLOCKED" | "NOT_FOUND" | "ALREADY_PENDING";

export interface FriendUserDto {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface FriendPresenceDto {
  status: FriendPresenceStatus;
  customStatus: string | null;
}

/**
 * The voice room a friend is in right now — Ana Sayfa 1a §4.6, karar #5.
 *
 * The friends strip's status line puts "<room>'da" above every other source, so
 * the room has to arrive with the list; before this field the name only existed
 * on the `friends:voice:update` socket event and the first paint had nothing to
 * show. Same audience rule as presence: a friend the viewer may not see
 * (invisible, or presence closed) carries `null`, never a room.
 */
export interface FriendVoiceRoomDto {
  channelId: string;
  channelName: string;
  serverId: string;
  serverName: string;
}

export interface FriendDto extends FriendUserDto {
  /** 2b §7. False when this friend has closed themselves to group invites. */
  allowsGroupInvites: boolean;
  status: FriendPresenceStatus;
  customStatus: string | null;
  /** ISO timestamp behind the mobile invite sheet's "n sa önce görüldü" line. */
  lastSeenAt: string | null;
  presence: FriendPresenceDto;
  /** Ana Sayfa §4.6. `null` when the friend is in no room, or may not be seen. */
  voiceRoom: FriendVoiceRoomDto | null;
}

export interface FriendRequestDto {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendStatusDto;
  createdAt: string;
  updatedAt: string;
  sender: FriendUserDto;
  receiver: FriendUserDto;
}

export interface PendingFriendsResponse {
  incoming: FriendRequestDto[];
  outgoing: FriendRequestDto[];
}

export type FriendRelationship = "none" | "friend" | "incoming" | "outgoing" | "blocked";

export interface FriendSearchResultDto extends FriendUserDto {
  relationship: FriendRelationship;
  requestId: string | null;
  /**
   * Server context, filled only when the search names a server (mobile invite
   * sheet 2b). A global search leaves them at their neutral values.
   */
  isMember: boolean;
  mutualServerCount: number;
  pendingInviteId: string | null;
}

export interface BlockStatus {
  blocked: boolean;
  blockedByUserA: boolean;
  blockedByUserB: boolean;
}

export interface FriendPresenceUpdateDto extends FriendPresenceDto {
  userId: string;
}

export const FriendStatusSchema = z.enum(["PENDING", "ACCEPTED", "DECLINED", "BLOCKED"]);
export const FriendPresenceStatusSchema = z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]);
export const FriendErrorCodeSchema = z.enum([
  "ALREADY_FRIENDS",
  "BLOCKED",
  "NOT_FOUND",
  "ALREADY_PENDING",
]);

export const FriendUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const FriendPresenceSchema = z.object({
  status: FriendPresenceStatusSchema,
  customStatus: z.string().nullable(),
});

export const FriendVoiceRoomSchema = z.object({
  channelId: z.string(),
  channelName: z.string(),
  serverId: z.string(),
  serverName: z.string(),
});

export const FriendSchema = FriendUserSchema.extend({
  /**
   * 2b §7 / F2. Defaulted to open so a response from a server that predates the
   * column parses as the behaviour it had.
   */
  allowsGroupInvites: z.boolean().default(true),
  status: FriendPresenceStatusSchema,
  customStatus: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  presence: FriendPresenceSchema,
  /** Defaulted so a response from a server that predates the field still parses. */
  voiceRoom: FriendVoiceRoomSchema.nullable().default(null),
});

export const FriendRequestSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  receiverId: z.string(),
  status: FriendStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  sender: FriendUserSchema,
  receiver: FriendUserSchema,
});

export const FriendsResponseSchema = z.array(FriendSchema);
export const PendingFriendsResponseSchema = z.object({
  incoming: z.array(FriendRequestSchema),
  outgoing: z.array(FriendRequestSchema),
});
export const FriendRequestMutationResponseSchema = z.object({
  request: FriendRequestSchema,
});
export const BlockedFriendsResponseSchema = z.array(FriendUserSchema);

export const FriendRequestBodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, "validation.username.min")
    .max(32, "validation.username.max")
    .regex(/^[a-zA-Z0-9_]+$/, "validation.username.pattern"),
});

export const FriendRequestActionSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

export const FriendRequestIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const FriendUserIdParamsSchema = z.object({
  userId: z.string().min(1),
});
