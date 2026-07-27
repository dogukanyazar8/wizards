import type { AdminRole } from "@wizards/db";
import { requireAdminUser, requireAdminUserById, type AdminAccessUser } from "@/lib/admin/access";
import { requireMobileApiSession } from "@/lib/auth/api";

/**
 * The single source of truth for admin authorization. A route that forgets its
 * role filter used to default to "every admin role", which is how `ANALYST`
 * reached the raw user list and the full activity export. Capabilities make the
 * decision explicit at the call site and let the navigation reuse the same map.
 */
export const ADMIN_CAPABILITIES = {
  "audit.read": ["OWNER", "ADMIN"],
  "campaign.approve": ["OWNER", "ADMIN"],
  "campaign.create": ["OWNER", "ADMIN"],
  "campaign.read": ["OWNER", "ADMIN"],
  "campaign.send": ["OWNER", "ADMIN"],
  // Reading a case exposes reporter identities; acting on one bans accounts.
  "case.action": ["OWNER", "ADMIN", "MODERATOR"],
  "case.read": ["OWNER", "ADMIN", "SUPPORT", "MODERATOR"],
  "dashboard.read": ["OWNER", "ADMIN", "SUPPORT", "ANALYST", "MODERATOR"],
  "export.activity": ["OWNER", "ADMIN"],
  // A kill switch changes what everyone sees; only the top two roles hold it.
  "flag.write": ["OWNER", "ADMIN"],
  // Client health is aggregate; every admin role may look at it.
  "health.read": ["OWNER", "ADMIN", "SUPPORT", "ANALYST", "MODERATOR"],
  "feedback.read": ["OWNER", "ADMIN", "SUPPORT", "ANALYST", "MODERATOR"],
  "feedback.write": ["OWNER", "ADMIN", "SUPPORT"],
  "server.read": ["OWNER", "ADMIN", "SUPPORT", "MODERATOR"],
  "user.ban": ["OWNER", "ADMIN", "MODERATOR"],
  "user.read": ["OWNER", "ADMIN", "SUPPORT", "MODERATOR"],
} as const satisfies Record<string, readonly AdminRole[]>;

export type AdminCapability = keyof typeof ADMIN_CAPABILITIES;

export function getAdminCapabilityRoles(capability: AdminCapability): readonly AdminRole[] {
  return ADMIN_CAPABILITIES[capability];
}

export function adminRoleHasCapability(role: AdminRole, capability: AdminCapability) {
  return (ADMIN_CAPABILITIES[capability] as readonly AdminRole[]).includes(role);
}

export async function requireAdminCapability(
  capability: AdminCapability,
): Promise<AdminAccessUser> {
  return requireAdminUser({ roles: [...ADMIN_CAPABILITIES[capability]] });
}

/**
 * Mobile carries a Bearer session instead of the cookie `requireAdminUser`
 * reads, so the session is resolved first and the *same* capability table then
 * decides. One map, two transports — a role can never mean two things.
 */
export async function requireMobileAdminCapability(
  request: Request,
  capability: AdminCapability,
): Promise<AdminAccessUser> {
  const session = await requireMobileApiSession(request);

  return requireAdminUserById(session.userId, { roles: [...ADMIN_CAPABILITIES[capability]] });
}
