import { auth } from "@/auth";
import { ApiError } from "@/lib/api";
import { assertActiveApiUser } from "@/lib/auth/access";
import { prisma } from "@wizards/db";

export async function requireApiUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new ApiError("Unauthorized", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      deletedAt: true,
      emailVerified: true,
      id: true,
      isBanned: true,
    },
  });

  assertActiveApiUser(user);

  return user.id;
}
