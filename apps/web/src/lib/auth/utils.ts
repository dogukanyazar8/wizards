import { auth } from "@/auth";
import { prisma } from "@wizards/db";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";

type AuthSession = Session | null | undefined;

export async function getCurrentUserForSession(session: AuthSession) {
  if (!session?.user?.id) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.user.id },
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
  });
}

export async function getCurrentUser(session?: AuthSession) {
  return getCurrentUserForSession(session ?? (await auth()));
}

export async function requireAuth() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session;
}
