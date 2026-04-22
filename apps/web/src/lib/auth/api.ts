import { auth } from "@/auth";
import { ApiError } from "@/lib/api";

export async function requireApiUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new ApiError("Unauthorized", 401);
  }

  return userId;
}
