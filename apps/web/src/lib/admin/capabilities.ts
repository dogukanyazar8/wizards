import { requireAdminUser, requireAdminUserById, type AdminAccessUser } from "@/lib/admin/access";
import {
  ADMIN_CAPABILITIES,
  type AdminCapability,
  adminRoleHasCapability,
  getAdminCapabilityRoles,
} from "@/lib/admin/capability-roles";
import { requireMobileApiSession } from "@/lib/auth/api";

export {
  ADMIN_CAPABILITIES,
  type AdminCapability,
  adminRoleHasCapability,
  getAdminCapabilityRoles,
};

/**
 * The single source of truth for admin authorization. A route that forgets its
 * role filter used to default to "every admin role", which is how `ANALYST`
 * reached the raw user list and the full activity export. Capabilities make the
 * decision explicit at the call site and let the navigation reuse the same map.
 */
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
