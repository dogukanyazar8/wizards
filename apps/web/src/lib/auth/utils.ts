import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "@wizards/db";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";

type AuthSession = Session | null | undefined;

/**
 * Request-scoped memoization for the authenticated data access layer.
 *
 * A single navigation renders the root layout, the section layout, and the page,
 * and each of them resolves the session independently. React's `cache` dedupes
 * that within one request without any of them coordinating.
 *
 * Two constraints this deliberately respects:
 * - The user loader is keyed on the user id, never on the session object. A
 *   session is a fresh object per resolution, so caching on it would never hit.
 * - `cache` only dedupes inside a React request/render. In a plain Node context
 *   (tests, scripts, route handlers) these behave exactly like the uncached
 *   calls they replaced, which is why nothing here depends on the memoization
 *   for correctness.
 */
const loadAuthSession = cache(async () => auth());

const loadUserById = cache(async (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      status: true,
      twoFactorEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  }),
);

export async function getCurrentUserForSession(session: AuthSession) {
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  return loadUserById(userId);
}

export async function getCurrentUser(session?: AuthSession) {
  return getCurrentUserForSession(session ?? (await loadAuthSession()));
}

export async function requireAuth() {
  const session = await loadAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session;
}
