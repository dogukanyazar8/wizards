import { prisma } from "@wizards/db";
import { ApiError, jsonError } from "@/lib/api";
import { authorizeMobileApiRequest } from "@/lib/auth/api";
import { createServerTimingForRequest } from "@/lib/server-timing";
import {
  MOBILE_UNREAD_COUNT_CAP,
  getServerUnreadAndMentionCounts,
} from "@/lib/workspace/unread-service";
import { getMobileBootstrapPayload, type MobileBootstrapHomeSummary } from "@/lib/mobile/bootstrap";
import { evaluateFlagsForUser } from "@/lib/feature-flags/service";
import { getAnalyticsClientInfo } from "@/lib/analytics/client-info";
import { buildServerInviteAddress } from "@/lib/servers/server-public-profile-service";
import {
  DEFAULT_SERVER_USER_SETTINGS,
  listServerUserSettingsWithDatabase,
} from "@/lib/workspace/server-user-settings-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const timing = createServerTimingForRequest(request);

  try {
    const stopAuthTiming = timing.start("auth");
    const userId = await authorizeMobileApiRequest(request, "mobile:bootstrap");
    stopAuthTiming();

    const [
      user,
      recentServerMemberships,
      serverTotalCount,
      recentDMParticipants,
      dmTotalCount,
      dmUnreadAggregate,
    ] = await timing.measure("db", () =>
      Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            avatarUrl: true,
            bannerColor: true,
            bannerOffsetX: true,
            bannerOffsetY: true,
            bannerUrl: true,
            displayName: true,
            id: true,
            locale: true,
            status: true,
            username: true,
          },
        }),
        prisma.serverMember.findMany({
          orderBy: { joinedAt: "desc" },
          take: 50,
          where: {
            pending: false,
            userId,
          },
          select: {
            joinedAt: true,
            server: {
              select: {
                _count: {
                  select: {
                    channels: true,
                    members: true,
                  },
                },
                iconUrl: true,
                id: true,
                // 6c's identity row prints `whispr.gg/<vanity ?? invite>`. Both
                // columns ride the query the rail already runs so opening the
                // menu costs nothing.
                inviteCode: true,
                name: true,
                shortName: true,
                vanityUrlCode: true,
              },
            },
          },
        }),
        prisma.serverMember.count({
          where: {
            pending: false,
            userId,
          },
        }),
        prisma.dMParticipant.findMany({
          orderBy: {
            conversation: {
              lastMessageAt: "desc",
            },
          },
          take: 5,
          where: {
            hiddenAt: null,
            userId,
          },
          select: {
            mentionCount: true,
            muted: true,
            unreadCount: true,
            conversation: {
              select: {
                iconUrl: true,
                id: true,
                lastMessageAt: true,
                name: true,
                participants: {
                  orderBy: {
                    joinedAt: "asc",
                  },
                  select: {
                    user: {
                      select: {
                        avatarUrl: true,
                        displayName: true,
                        id: true,
                        isBot: true,
                        status: true,
                        username: true,
                      },
                    },
                  },
                  take: 4,
                },
                type: true,
                _count: {
                  select: {
                    participants: true,
                  },
                },
              },
            },
          },
        }),
        prisma.dMParticipant.count({
          where: {
            hiddenAt: null,
            userId,
          },
        }),
        prisma.dMParticipant.aggregate({
          _sum: {
            unreadCount: true,
          },
          where: {
            hiddenAt: null,
            userId,
          },
        }),
      ]),
    );

    if (!user) {
      throw new ApiError("User not found", 404, "USER_NOT_FOUND");
    }

    const recentServerIds = recentServerMemberships.map((membership) => membership.server.id);
    // A0.3: one `IN` query for every server's preferences, not one per server —
    // the rail can hold 50 of them and this is the cold-start path.
    const [{ mentionCounts, unreadCounts }, serverUserSettings] = await timing.measure("db", () =>
      Promise.all([
        getServerUnreadAndMentionCounts(userId, recentServerIds, {
          unreadCountCap: MOBILE_UNREAD_COUNT_CAP,
        }),
        listServerUserSettingsWithDatabase(prisma, userId, recentServerIds),
      ]),
    );

    const home: MobileBootstrapHomeSummary = {
      directMessages: {
        recent: recentDMParticipants.map((participant) => ({
          iconUrl: normalizeMobileImageUrl(participant.conversation.iconUrl),
          id: participant.conversation.id,
          lastMessageAt: participant.conversation.lastMessageAt.toISOString(),
          mentionCount: Math.max(0, participant.mentionCount),
          muted: participant.muted,
          name: participant.conversation.name,
          participantCount: participant.conversation._count.participants,
          participants: participant.conversation.participants.map(({ user: conversationUser }) => ({
            avatarUrl: normalizeMobileImageUrl(conversationUser.avatarUrl),
            displayName: conversationUser.displayName,
            id: conversationUser.id,
            isBot: conversationUser.isBot,
            status: conversationUser.status,
            username: conversationUser.username,
          })),
          type: participant.conversation.type,
          unreadCount: Math.max(0, participant.unreadCount),
        })),
        totalCount: dmTotalCount,
        unreadCount: Math.max(0, dmUnreadAggregate._sum.unreadCount ?? 0),
      },
      servers: {
        recent: recentServerMemberships.map((membership) => {
          // No row means the member never changed anything, which is the
          // default rather than a miss (the row is created on first write).
          const settings =
            serverUserSettings.get(membership.server.id) ?? DEFAULT_SERVER_USER_SETTINGS;

          return {
            channelCount: membership.server._count.channels,
            iconUrl: normalizeMobileImageUrl(membership.server.iconUrl),
            id: membership.server.id,
            inviteAddress: buildServerInviteAddress(membership.server),
            joinedAt: membership.joinedAt.toISOString(),
            memberCount: membership.server._count.members,
            mentionCount: mentionCounts.get(membership.server.id) ?? 0,
            muted: settings.muted,
            name: membership.server.name,
            notificationLevel: settings.notificationLevel,
            shortName: membership.server.shortName,
            starred: settings.starred,
            unreadCount: unreadCounts.get(membership.server.id) ?? 0,
          };
        }),
        totalCount: serverTotalCount,
      },
    };

    const adminMembership = await prisma.adminMembership.findUnique({
      where: { userId },
      select: { role: true },
    });
    const flags = await evaluateFlagsForUser({
      clientType: getAnalyticsClientInfo(request.headers).clientType,
      userId,
    });

    return Response.json(
      getMobileBootstrapPayload({
        flags,
        home,
        isAdmin: adminMembership !== null,
        user: {
          ...user,
          avatarUrl: normalizeMobileImageUrl(user.avatarUrl),
          bannerUrl: normalizeMobileImageUrl(user.bannerUrl),
        },
      }),
      { headers: timing.headers({ "Cache-Control": "no-store, no-cache, must-revalidate" }) },
    );
  } catch (error) {
    return jsonError(error, timing.requestId);
  }
}

function normalizeMobileImageUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
