import { prisma } from "@wizards/db";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ApiError, jsonError } from "@/lib/api";
import type { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const requesterId = await requireApiUserId();
    await enforceApiRateLimit(requesterId, "user:profile");
    const { userId } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bannerUrl: true,
        bannerColor: true,
        bio: true,
        customStatus: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new ApiError("User not found", 404);
    }

    let serverNickname: string | null = null;
    const serverId = request.nextUrl.searchParams.get("serverId");

    if (serverId) {
      const requesterMember = await prisma.serverMember.findFirst({
        where: {
          serverId,
          userId: requesterId,
        },
        select: {
          id: true,
        },
      });

      if (!requesterMember) {
        throw new ApiError("Server profile not found", 404);
      }

      const member = await prisma.serverMember.findFirst({
        where: {
          userId,
          serverId,
        },
        select: {
          nickname: true,
        },
      });

      serverNickname = member?.nickname ?? null;
    }

    return Response.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      bannerColor: user.bannerColor,
      bio: user.bio,
      customStatus: user.customStatus,
      createdAt: user.createdAt.toISOString(),
      serverNickname,
    });
  } catch (error) {
    return jsonError(error);
  }
}
