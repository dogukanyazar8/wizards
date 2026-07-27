import type { AdminRole } from "@wizards/db";
import { adminRoleHasCapability, type AdminCapability } from "@/lib/admin/capabilities";

export type AdminNavItem = {
  capability: AdminCapability;
  href: string;
  /** Matches the icon set already bundled with the app (lucide). */
  icon: "gauge" | "users" | "server" | "activity" | "scroll" | "megaphone" | "flag";
  key: string;
  label: string;
};

export type AdminNavGroup = {
  items: AdminNavItem[];
  label: string;
};

/**
 * Visibility is derived from the capability map rather than kept as a second
 * list: a role that cannot call the endpoint should not see the module, and one
 * source means the two can never disagree.
 */
export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    items: [
      {
        capability: "dashboard.read",
        href: "/admin",
        icon: "gauge",
        key: "overview",
        label: "Genel Bakış",
      },
      {
        capability: "user.read",
        href: "/admin/users",
        icon: "users",
        key: "users",
        label: "Kullanıcılar",
      },
      {
        capability: "server.read",
        href: "/admin/servers",
        icon: "server",
        key: "servers",
        label: "Sunucular",
      },
    ],
    label: "Platform",
  },
  {
    items: [
      {
        capability: "audit.read",
        href: "/admin/audit",
        icon: "scroll",
        key: "audit",
        label: "Denetim Kaydı",
      },
    ],
    label: "Güven & Güvenlik",
  },
  {
    items: [
      {
        capability: "dashboard.read",
        href: "/admin/activity",
        icon: "activity",
        key: "activity",
        label: "Aktivite",
      },
      {
        capability: "campaign.read",
        href: "/admin/notifications",
        icon: "megaphone",
        key: "notifications",
        label: "Bildirimler",
      },
      {
        capability: "feedback.read",
        href: "/admin/feedback",
        icon: "flag",
        key: "feedback",
        label: "Geri Bildirim",
      },
    ],
    label: "Operasyon",
  },
];

/** A group whose every item is hidden disappears with its heading. */
export function getVisibleAdminNavGroups(role: AdminRole): AdminNavGroup[] {
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => adminRoleHasCapability(role, item.capability)),
  })).filter((group) => group.items.length > 0);
}

export function findAdminNavItemByKey(key: string) {
  return ADMIN_NAV_GROUPS.flatMap((group) => group.items).find((item) => item.key === key) ?? null;
}
