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

type AdminBootstrapEnv = Partial<
  Record<"ADMIN_EMAILS" | "NODE_ENV" | "RAILWAY_ENVIRONMENT_NAME" | "WHISPR_ADMIN_EMAILS", string>
>;

function isAllowedRole(role: AdminRole, roles: AdminRole[] | undefined) {
  return !roles || roles.includes(role);
}

/**
 * The role gate every admin entry point ends up in. Exported so the capability
 * contract tests can prove a role/capability pair really produces the shared
 * 403 envelope instead of asserting on a copy of the rule.
 */
export function ensureAdminRoleAllowed(
  role: AdminRole | null | undefined,
  roles: AdminRole[] | undefined,
): AdminRole {
  if (!role || !isAllowedRole(role, roles)) {
    throw new ApiError("Admin access required", 403, "ADMIN_ACCESS_REQUIRED");
  }

  return role;
}

function normalizeEnvValue(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function getBootstrapAdminEmailConfig(env: AdminBootstrapEnv = process.env) {
  const whisprAdminEmails = env.WHISPR_ADMIN_EMAILS?.trim();

  if (whisprAdminEmails) {
    return { source: "WHISPR_ADMIN_EMAILS", value: whisprAdminEmails };
  }

  return { source: "ADMIN_EMAILS", value: env.ADMIN_EMAILS ?? "" };
}

export function isProductionAdminBootstrapEnvironment(env: AdminBootstrapEnv = process.env) {
  return (
    normalizeEnvValue(env.NODE_ENV) === "production" ||
    normalizeEnvValue(env.RAILWAY_ENVIRONMENT_NAME) === "production"
  );
}

function getBootstrapAdminEmails(env: AdminBootstrapEnv = process.env) {
  const config = getBootstrapAdminEmailConfig(env);

  return new Set(
    config.value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function canBootstrapAdminFromEnvironment(
  email: string,
  env: AdminBootstrapEnv = process.env,
) {
  return (
    !isProductionAdminBootstrapEnvironment(env) &&
    getBootstrapAdminEmails(env).has(email.trim().toLowerCase())
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

  if (!canBootstrapAdminFromEnvironment(user.email)) {
    return null;
  }

  const bootstrapConfig = getBootstrapAdminEmailConfig();

  try {
    const membership = await prisma.$transaction(async (tx) => {
      const createdMembership = await tx.adminMembership.create({
        data: {
          reason: "Environment bootstrap admin",
          role: "OWNER",
          userId: user.id,
        },
        select: { role: true },
      });

      await tx.adminAuditLog.create({
        data: {
          action: "admin.bootstrap.grant",
          adminUserId: user.id,
          metadata: {
            email: user.email,
            source: bootstrapConfig.source,
          },
          reason: "Environment bootstrap admin",
          targetId: user.id,
          targetType: "User",
          userAgentHash: null,
        },
      });

      return createdMembership;
    });

    return membership.role;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const membership = await prisma.adminMembership.findUnique({
        where: { userId: user.id },
        select: { role: true },
      });

      return membership?.role ?? null;
    }

    throw error;
  }
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

  const role = ensureAdminRoleAllowed(await getOrCreateBootstrapRole(user), options.roles);

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
