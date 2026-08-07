import type { AdminRole } from "@wizards/db";

/**
 * Role policy stays dependency-free so background workers can apply it without
 * loading the cookie-session implementation.
 */
export const ADMIN_CAPABILITIES = {
  "audit.read": ["OWNER", "ADMIN"],
  // Granting a badge writes to a public profile surface; revoking one is a
  // moderation act. Support may look, only the top two may write.
  "badge.read": ["OWNER", "ADMIN", "SUPPORT", "MODERATOR"],
  "badge.write": ["OWNER", "ADMIN"],
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
  "help.write": ["OWNER", "ADMIN"],
  "release.read": ["OWNER", "ADMIN", "SUPPORT", "ANALYST", "MODERATOR"],
  "release.write": ["OWNER", "ADMIN"],
  "server.read": ["OWNER", "ADMIN", "SUPPORT", "MODERATOR"],
  // Creating or deleting a community server changes what every user can
  // discover and join. Only the two founding roles may write.
  "server.write": ["OWNER", "ADMIN"],
  "support.read": ["OWNER", "ADMIN", "SUPPORT"],
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
