import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { prisma } from "@wizards/db";

export async function DELETE() {
  try {
    const userId = await requireApiUserId();

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
