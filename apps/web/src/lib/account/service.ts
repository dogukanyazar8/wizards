import { MobileMediaUploadPurpose, UserStatus, prisma } from "@wizards/db";
import {
  MOBILE_USERNAME_CHANGE_COOLDOWN_DAYS as USERNAME_CHANGE_COOLDOWN_DAYS,
  MOBILE_USERNAME_COOLDOWN_ERROR_CODE,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { broadcastPresenceUpdateToFriends, persistUserPresence } from "@/lib/friends/service";
import type { FriendPresenceStatus, FriendPresenceUpdateDto } from "@/lib/friends/types";
import type { UserProfileUpdatedPayload } from "@/lib/socket/events";
import { getSocketServer } from "@/lib/socket/runtime";

const accountUserSelect = {
  avatarUrl: true,
  bannerColor: true,
  bannerUrl: true,
  bio: true,
  customStatus: true,
  customStatusEmoji: true,
  customStatusExpiresAt: true,
  displayName: true,
  email: true,
  emailVerified: true,
  id: true,
  pronouns: true,
  status: true,
  twoFactorEnabled: true,
  username: true,
  usernameChangedAt: true,
} as const;

export type AccountProfileRecord = {
  avatarUrl: string | null;
  bannerColor: string | null;
  bannerUrl: string | null;
  bio: string | null;
  customStatus: string | null;
  customStatusEmoji: string | null;
  customStatusExpiresAt: Date | null;
  displayName: string | null;
  email: string;
  emailVerified: boolean;
  id: string;
  pronouns: string | null;
  status: UserStatus;
  twoFactorEnabled: boolean;
  username: string;
  usernameChangedAt: Date | null;
};

export type AccountProfileUpdate = {
  bannerColor?: string | null | undefined;
  bannerUrl?: string | null | undefined;
  bio?: string | null | undefined;
  customStatus?: string | null | undefined;
  customStatusEmoji?: string | null | undefined;
  customStatusExpiresAt?: string | null | undefined;
  displayName?: string | null | undefined;
  email?: string | undefined;
  pronouns?: string | null | undefined;
  status?: UserStatus | undefined;
  username?: string | undefined;
};

type PersistedAccountProfile = Pick<
  AccountProfileRecord,
  | "bannerColor"
  | "bannerUrl"
  | "bio"
  | "customStatus"
  | "customStatusEmoji"
  | "customStatusExpiresAt"
  | "displayName"
  | "email"
  | "pronouns"
  | "status"
  | "username"
> & { usernameChangedAt?: Date };

export type AccountServiceDependencies = {
  broadcastPresence(presence: FriendPresenceUpdateDto): Promise<void>;
  broadcastProfile(profile: UserProfileUpdatedPayload): Promise<void>;
  findEmailConflict(email: string, userId: string): Promise<boolean>;
  findUser(userId: string): Promise<AccountProfileRecord | null>;
  findUsernameConflict(username: string, userId: string): Promise<boolean>;
  /** Injected so the username cooldown can be exercised without waiting 30 days. */
  now?(): Date;
  /**
   * A banner URL is only ever minted by the upload claim, so PATCH accepts one
   * back only if this account actually uploaded it. Without the check any
   * https address would be accepted and then rendered inside every viewer's
   * client, which turns a profile field into an arbitrary outbound request.
   */
  ownsBannerUpload(userId: string, url: string): Promise<boolean>;
  persistPresence(
    userId: string,
    status: FriendPresenceStatus,
  ): Promise<FriendPresenceUpdateDto | null>;
  updateUser(userId: string, input: PersistedAccountProfile): Promise<AccountProfileRecord>;
};

const USERNAME_CHANGE_COOLDOWN_MS = USERNAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/**
 * When the next username change becomes allowed, or null when one is allowed now.
 * Exported so read paths report the same instant the write path enforces.
 */
export function getNextUsernameChangeAt(
  usernameChangedAt: Date | null,
  now: Date = new Date(),
): Date | null {
  if (!usernameChangedAt) {
    return null;
  }

  const next = new Date(usernameChangedAt.getTime() + USERNAME_CHANGE_COOLDOWN_MS);
  return next.getTime() > now.getTime() ? next : null;
}

export type VisibleCustomStatus = {
  customStatus: string | null;
  customStatusEmoji: string | null;
  customStatusExpiresAt: string | null;
};

/**
 * An expired custom status stays in the row until the next write, so every read path
 * hides it instead of showing a stale "listening to…" hours later.
 */
export function resolveVisibleCustomStatus(
  user: {
    customStatus: string | null;
    customStatusEmoji: string | null;
    customStatusExpiresAt: Date | null;
  },
  now: Date = new Date(),
): VisibleCustomStatus {
  if (user.customStatusExpiresAt && user.customStatusExpiresAt.getTime() <= now.getTime()) {
    return { customStatus: null, customStatusEmoji: null, customStatusExpiresAt: null };
  }

  return {
    customStatus: user.customStatus,
    customStatusEmoji: user.customStatusEmoji,
    customStatusExpiresAt: user.customStatusExpiresAt?.toISOString() ?? null,
  };
}

export function mapVisiblePresenceStatus(status: UserStatus): FriendPresenceStatus {
  if (
    status === UserStatus.ONLINE ||
    status === UserStatus.IDLE ||
    status === UserStatus.DND ||
    status === UserStatus.OFFLINE
  ) {
    return status;
  }

  return "OFFLINE";
}

export async function broadcastUserProfileUpdate(profile: UserProfileUpdatedPayload) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  const [friendships, serverMemberships] = await Promise.all([
    prisma.friendRequest.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ senderId: profile.userId }, { receiverId: profile.userId }],
      },
      select: { receiverId: true, senderId: true },
    }),
    prisma.serverMember.findMany({
      where: { userId: profile.userId },
      select: { serverId: true },
    }),
  ]);

  const targetUserIds = new Set<string>([profile.userId]);
  for (const friendship of friendships) {
    targetUserIds.add(
      friendship.senderId === profile.userId ? friendship.receiverId : friendship.senderId,
    );
  }

  for (const targetUserId of targetUserIds) {
    io.to(`user:${targetUserId}`).emit("user:profile:updated", profile);
  }

  for (const membership of serverMemberships) {
    io.to(`server:${membership.serverId}`).emit("user:profile:updated", profile);
  }
}

const defaultDependencies: AccountServiceDependencies = {
  broadcastPresence: broadcastPresenceUpdateToFriends,
  broadcastProfile: broadcastUserProfileUpdate,
  async findEmailConflict(email, userId) {
    return Boolean(
      await prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
        select: { id: true },
      }),
    );
  },
  findUser(userId) {
    return prisma.user.findUnique({ where: { id: userId }, select: accountUserSelect });
  },
  async findUsernameConflict(username, userId) {
    return Boolean(
      await prisma.user.findFirst({
        where: { username, NOT: { id: userId } },
        select: { id: true },
      }),
    );
  },
  async ownsBannerUpload(userId, url) {
    return Boolean(
      await prisma.mobileMediaUpload.findFirst({
        where: { ownerId: userId, purpose: MobileMediaUploadPurpose.PROFILE_BANNER, url },
        select: { id: true },
      }),
    );
  },
  persistPresence: persistUserPresence,
  updateUser(userId, input) {
    return prisma.user.update({
      where: { id: userId },
      data: input,
      select: accountUserSelect,
    });
  },
};

export async function updateAccountProfile(
  userId: string,
  input: AccountProfileUpdate,
  dependencies: AccountServiceDependencies = defaultDependencies,
) {
  const currentUser = await dependencies.findUser(userId);
  if (!currentUser) {
    throw new ApiError("Account not found", 404, "USER_NOT_FOUND");
  }

  const now = dependencies.now?.() ?? new Date();
  const isUsernameChanging =
    input.username !== undefined && input.username !== currentUser.username;

  if (isUsernameChanging) {
    const blockedUntil = getNextUsernameChangeAt(currentUser.usernameChangedAt, now);
    if (blockedUntil) {
      throw new ApiError(
        "Username can only be changed once every 30 days",
        429,
        MOBILE_USERNAME_COOLDOWN_ERROR_CODE,
      );
    }
  }

  // Re-sending the stored banner is a no-op and must not re-check ownership: the
  // upload row can have been cleaned up long after the banner was applied.
  const nextBannerUrl = input.bannerUrl?.trim() || null;
  if (
    input.bannerUrl !== undefined &&
    nextBannerUrl !== null &&
    nextBannerUrl !== currentUser.bannerUrl &&
    !(await dependencies.ownsBannerUpload(userId, nextBannerUrl))
  ) {
    throw new ApiError("Banner image is not an upload you own", 400, "BANNER_NOT_OWNED");
  }

  const nextProfile: PersistedAccountProfile = {
    bannerColor:
      input.bannerColor === undefined ? currentUser.bannerColor : input.bannerColor?.trim() || null,
    bannerUrl: input.bannerUrl === undefined ? currentUser.bannerUrl : nextBannerUrl,
    // Free-text profile fields collapse to null when cleared so an empty string never
    // becomes a "set" value that clients must special-case.
    bio: input.bio === undefined ? currentUser.bio : input.bio?.trim() || null,
    customStatus:
      input.customStatus === undefined
        ? currentUser.customStatus
        : input.customStatus?.trim() || null,
    customStatusEmoji:
      input.customStatusEmoji === undefined
        ? currentUser.customStatusEmoji
        : input.customStatusEmoji?.trim() || null,
    customStatusExpiresAt:
      input.customStatusExpiresAt === undefined
        ? currentUser.customStatusExpiresAt
        : input.customStatusExpiresAt
          ? new Date(input.customStatusExpiresAt)
          : null,
    displayName:
      input.displayName === undefined ? currentUser.displayName : input.displayName?.trim() || null,
    email: input.email ?? currentUser.email,
    pronouns: input.pronouns === undefined ? currentUser.pronouns : input.pronouns?.trim() || null,
    status: input.status ?? currentUser.status,
    username: input.username ?? currentUser.username,
    ...(isUsernameChanging ? { usernameChangedAt: now } : {}),
  };

  const [emailConflict, usernameConflict] = await Promise.all([
    dependencies.findEmailConflict(nextProfile.email, userId),
    dependencies.findUsernameConflict(nextProfile.username, userId),
  ]);
  if (emailConflict) {
    throw new ApiError("Email is already in use", 409, "EMAIL_TAKEN");
  }
  if (usernameConflict) {
    throw new ApiError("Username is already in use", 409, "USERNAME_TAKEN");
  }

  const updatedUser = await dependencies.updateUser(userId, nextProfile);
  const visibleStatus = mapVisiblePresenceStatus(updatedUser.status);
  const presence = await dependencies.persistPresence(userId, visibleStatus);
  if (presence) {
    await dependencies.broadcastPresence(presence);
  }
  await dependencies.broadcastProfile({
    avatarUrl: updatedUser.avatarUrl,
    customStatus: updatedUser.customStatus,
    displayName: updatedUser.displayName,
    status: visibleStatus,
    userId,
    username: updatedUser.username,
  });

  return updatedUser;
}

export async function updateAccountPresence(
  userId: string,
  status: FriendPresenceStatus,
  dependencies: AccountServiceDependencies = defaultDependencies,
) {
  const presence = await dependencies.persistPresence(userId, status);
  if (!presence) {
    throw new ApiError("Presence service unavailable", 503, "PRESENCE_UNAVAILABLE");
  }

  await dependencies.broadcastPresence(presence);
  return presence;
}
