import { prisma } from "@wizards/db";
import { ApiError, jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { getSettingsBootstrapPayload } from "@/lib/settings/bootstrap";

export async function GET() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "settings:bootstrap");
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        avatarUrl: true,
        displayName: true,
        email: true,
        emailVerified: true,
        id: true,
        locale: true,
        status: true,
        twoFactorEnabled: true,
        username: true,
      },
    });

    if (!user) {
      throw new ApiError("User not found", 404);
    }

    const { locale, ...accountUser } = user;
    const payload = await getSettingsBootstrapPayload({
      locale,
      user: accountUser,
    });

    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}
