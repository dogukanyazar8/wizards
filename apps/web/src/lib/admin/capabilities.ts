import type { AdminRole } from "@wizards/db";
import { requireAdminUser, type AdminAccessUser } from "@/lib/admin/access";

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
