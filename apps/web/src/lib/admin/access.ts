import { Prisma, type AdminRole, prisma } from "@wizards/db";
import { auth } from "@/auth";
import { ApiError } from "@/lib/api";
import { hashAnalyticsValue } from "@/lib/analytics/client-info";
import { assertActiveApiUser } from "@/lib/auth/access";

export type AdminAccessUser = {
  email: string;
  id: string;
  role: AdminRole;
  username: string;
};

type RequireAdminOptions = {
  roles?: AdminRole[];
};

function isAllowedRole(role: AdminRole, roles: AdminRole[] | undefined) {
  return !roles || roles.includes(role);
}

function getBootstrapAdminEmails() {
  return new Set(
    (process.env.WHISPR_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function getOrCreateBootstrapRole(user: {
  adminMembership: { role: AdminRole } | null;
  email: string;
  id: string;
}) {
  if (user.adminMembership?.role) {
    return user.adminMembership.role;
  }

  if (!getBootstrapAdminEmails().has(user.email.toLowerCase())) {
    return null;
  }

  const membership = await prisma.adminMembership.upsert({
    where: { userId: user.id },
    create: {
      reason: "Environment bootstrap admin",
      role: "OWNER",
      userId: user.id,
    },
    update: {},
    select: { role: true },
  });

  return membership.role;
}

export async function requireAdminUser(
  options: RequireAdminOptions = {},
): Promise<AdminAccessUser> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      adminMembership: {
        select: {
          role: true,
        },
      },
      email: true,
      emailVerified: true,
      id: true,
      isBanned: true,
      username: true,
    },
  });

  assertActiveApiUser(user);

  const role = await getOrCreateBootstrapRole(user);
  if (!role || !isAllowedRole(role, options.roles)) {
    throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
  }

  return {
    email: user.email,
    id: user.id,
    role,
    username: user.username,
  };
}

export async function writeAdminAuditLog(args: {
  action: string;
  adminUserId?: string | null;
  headers?: Headers | Record<string, string | string[] | undefined> | null;
  metadata?: Record<string, unknown> | null;
  reason?: string | null;
  targetId?: string | null;
  targetType?: string | null;
}) {
  const userAgent =
    args.headers && "get" in args.headers && typeof args.headers.get === "function"
      ? args.headers.get("user-agent")
      : args.headers && !("get" in args.headers)
        ? (args.headers["user-agent"] as string | undefined)
        : null;

  await prisma.adminAuditLog.create({
    data: {
      action: args.action,
      adminUserId: args.adminUserId ?? null,
      ...(args.metadata !== undefined
        ? {
            metadata:
              args.metadata === null ? Prisma.JsonNull : (args.metadata as Prisma.InputJsonValue),
          }
        : {}),
      reason: args.reason ?? null,
      targetId: args.targetId ?? null,
      targetType: args.targetType ?? null,
      userAgentHash: hashAnalyticsValue(userAgent),
    },
  });
}
