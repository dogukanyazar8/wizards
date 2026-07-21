import { UserStatus, prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import {
  broadcastPresenceUpdateToFriends,
  persistUserPresence,
} from "@/lib/friends/service";
import type {
  FriendPresenceStatus,
  FriendPresenceUpdateDto,
} from "@/lib/friends/types";
import type { UserProfileUpdatedPayload } from "@/lib/socket/events";
import { getSocketServer } from "@/lib/socket/runtime";

const accountUserSelect = {
  avatarUrl: true,
  bio: true,
  customStatus: true,
  displayName: true,
  email: true,
  emailVerified: true,
  id: true,
  status: true,
  twoFactorEnabled: true,
  username: true,
} as const;

export type AccountProfileRecord = {
  avatarUrl: string | null;
  bio: string | null;
  customStatus: string | null;
  displayName: string | null;
  email: string;
  emailVerified: boolean;
  id: string;
  status: UserStatus;
  twoFactorEnabled: boolean;
  username: string;
};

export type AccountProfileUpdate = {
  bio?: string | null | undefined;
  customStatus?: string | null | undefined;
  displayName?: string | null | undefined;
  email?: string | undefined;
  status?: UserStatus | undefined;
  username?: string | undefined;
};

type PersistedAccountProfile = Pick<
  AccountProfileRecord,
  "bio" | "customStatus" | "displayName" | "email" | "status" | "username"
>;

export type AccountServiceDependencies = {
  broadcastPresence(presence: FriendPresenceUpdateDto): Promise<void>;
  broadcastProfile(profile: UserProfileUpdatedPayload): Promise<void>;
  findEmailConflict(email: string, userId: string): Promise<boolean>;
  findUser(userId: string): Promise<AccountProfileRecord | null>;
  findUsernameConflict(username: string, userId: string): Promise<boolean>;
  persistPresence(
    userId: string,
    status: FriendPresenceStatus,
  ): Promise<FriendPresenceUpdateDto | null>;
  updateUser(userId: string, input: PersistedAccountProfile): Promise<AccountProfileRecord>;
};

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
      friendship.senderId === profile.userId
        ? friendship.receiverId
        : friendship.senderId,
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

  const nextProfile: PersistedAccountProfile = {
    // Free-text profile fields collapse to null when cleared so an empty string never
    // becomes a "set" value that clients must special-case.
    bio: input.bio === undefined ? currentUser.bio : input.bio?.trim() || null,
    customStatus:
      input.customStatus === undefined
        ? currentUser.customStatus
        : input.customStatus?.trim() || null,
    displayName:
      input.displayName === undefined
        ? currentUser.displayName
        : input.displayName?.trim() || null,
    email: input.email ?? currentUser.email,
    status: input.status ?? currentUser.status,
    username: input.username ?? currentUser.username,
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
