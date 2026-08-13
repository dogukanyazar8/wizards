import { prisma } from "@wizards/db";

import { requireApiUserId } from "@/lib/auth/api";

import { accountDeletionPreflightRoute } from "./route-logic";

export async function GET() {
  return accountDeletionPreflightRoute({
    authenticate: requireApiUserId,
    loadUser: (userId) =>
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          emailVerified: true,
          id: true,
          ownedServers: {
            orderBy: { id: "asc" },
            select: { id: true, name: true },
            take: 100,
          },
          passwordHash: true,
        },
      }),
  });
}
