import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { getWebUserProfile } from "@/lib/social/web-user-profile-service";
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

    const serverId = request.nextUrl.searchParams.get("serverId");
    return Response.json(await getWebUserProfile({ requesterId, serverId, userId }));
  } catch (error) {
    return jsonError(error);
  }
}
