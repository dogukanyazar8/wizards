import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { prisma } from "@wizards/db";

export async function DELETE() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "notification:clear");

    await prisma.notification.deleteMany({
      where: {
        userId,
      },
    });

    return Response.json({});
  } catch (error) {
    return jsonError(error);
  }
}
