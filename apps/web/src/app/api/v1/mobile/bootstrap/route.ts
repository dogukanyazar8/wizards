import { prisma } from "@wizards/db";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ApiError, jsonError } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { getMobileBootstrapPayload } from "@/lib/mobile/bootstrap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const userId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(userId, "mobile:bootstrap");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        avatarUrl: true,
        displayName: true,
        id: true,
        locale: true,
        status: true,
        username: true,
      },
    });

    if (!user) {
      throw new ApiError("User not found", 404, "USER_NOT_FOUND");
    }

    return Response.json(getMobileBootstrapPayload({ user }), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
