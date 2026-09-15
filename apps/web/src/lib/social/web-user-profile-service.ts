import { ApiError } from "@/lib/api";
import { activeProfileStatus } from "@wizards/types";
import {
  resolveVisibilityDecisions,
  type VisibilityDecision,
} from "@/lib/privacy/visibility-policy";

type WebProfileUser = {
  avatarUrl: string | null;
  bannerColor: string | null;
  bannerOffsetX: number | null;
  bannerOffsetY: number | null;
  bannerUrl: string | null;
  bio: string | null;
  createdAt: Date;
  customStatus: string | null;
  customStatusEmoji: string | null;
  customStatusExpiresAt: Date | null;
  deletedAt: Date | null;
  displayName: string | null;
  id: string;
  username: string;
  status: string;
};

type ServerMembership = { nickname: string | null; userId: string };

export type WebUserProfileDependencies = {
  findServerMemberships(serverId: string, userIds: readonly string[]): Promise<ServerMembership[]>;
  findUser(userId: string): Promise<WebProfileUser | null>;
  resolveVisibility(
    requesterId: string,
    subjectIds: readonly string[],
  ): Promise<Map<string, VisibilityDecision>>;
};

const defaultDependencies: WebUserProfileDependencies = {
  findServerMemberships: async (serverId, userIds) => {
    const { prisma } = await import("@wizards/db");
    return prisma.serverMember.findMany({
      where: { serverId, userId: { in: [...userIds] } },
      select: { nickname: true, userId: true },
      take: 2,
    });
  },
  findUser: async (userId) => {
    const { prisma } = await import("@wizards/db");
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        avatarUrl: true,
        bannerColor: true,
        bannerOffsetX: true,
        bannerOffsetY: true,
        bannerUrl: true,
        bio: true,
        createdAt: true,
        customStatus: true,
        customStatusEmoji: true,
        customStatusExpiresAt: true,
        deletedAt: true,
        displayName: true,
        id: true,
        username: true,
        status: true,
      },
    });
  },
  resolveVisibility: resolveVisibilityDecisions,
};

export async function getWebUserProfile(
  input: { requesterId: string; serverId: string | null; userId: string },
  dependencies: WebUserProfileDependencies = defaultDependencies,
) {
  const [user, decisions] = await Promise.all([
    dependencies.findUser(input.userId),
    dependencies.resolveVisibility(input.requesterId, [input.userId]),
  ]);
  const decision = decisions.get(input.userId);

  if (!user || user.deletedAt || !decision?.canViewProfile) {
    throw new ApiError("User not found", 404, "USER_NOT_FOUND");
  }

  let serverNickname: string | null = null;
  if (input.serverId) {
    const memberships = await dependencies.findServerMemberships(
      input.serverId,
      input.requesterId === input.userId ? [input.requesterId] : [input.requesterId, input.userId],
    );
    if (!memberships.some((member) => member.userId === input.requesterId)) {
      throw new ApiError("Server profile not found", 404, "SERVER_PROFILE_NOT_FOUND");
    }
    serverNickname = memberships.find((member) => member.userId === input.userId)?.nickname ?? null;
  }

  return {
    avatarUrl: user.avatarUrl,
    bannerColor: user.bannerColor,
    bannerOffsetX: user.bannerOffsetX,
    bannerOffsetY: user.bannerOffsetY,
    bannerUrl: user.bannerUrl,
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
    ...activeProfileStatus({
      ...user,
      customStatus:
        decision.canViewPresence && user.status !== "OFFLINE" && user.status !== "INVISIBLE"
          ? user.customStatus
          : null,
    }),
    displayName: user.displayName,
    id: user.id,
    serverNickname,
    username: user.username,
  };
}
