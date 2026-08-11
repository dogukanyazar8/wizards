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

export interface FriendDto extends FriendUserDto {
  /** 2b §7. False when this friend has closed themselves to group invites. */
  allowsGroupInvites: boolean;
  status: FriendPresenceStatus;
  customStatus: string | null;
  /** ISO timestamp behind the mobile invite sheet's "n sa önce görüldü" line. */
  lastSeenAt: string | null;
  presence: FriendPresenceDto;
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

export type FriendRequestBody = z.infer<typeof FriendRequestBodySchema>;
export type FriendRequestAction = z.infer<typeof FriendRequestActionSchema>;
