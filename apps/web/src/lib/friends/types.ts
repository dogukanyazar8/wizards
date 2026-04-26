import { z } from "zod";

export type FriendStatusDto = "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED";

export type FriendPresenceStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE" | "INVISIBLE";

export interface FriendUserDto {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface FriendDto extends FriendUserDto {
  status: FriendPresenceStatus;
  customStatus: string | null;
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

export interface BlockStatus {
  blocked: boolean;
  blockedByUserA: boolean;
  blockedByUserB: boolean;
}

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
