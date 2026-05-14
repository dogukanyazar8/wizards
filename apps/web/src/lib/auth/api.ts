import { auth } from "@/auth";
import { ApiError } from "@/lib/api";
import { assertActiveApiUser } from "@/lib/auth/access";

export async function requireApiUserId() {
  const session = await auth();
  const user = session?.user;
  const userId = user?.id;

  if (!userId) {
    throw new ApiError("Unauthorized", 401);
  }

  assertActiveApiUser({
    deletedAt: user.deletedAt,
    emailVerified: user.authEmailVerified,
    id: userId,
    isBanned: user.isBanned,
  });

  return userId;
}
