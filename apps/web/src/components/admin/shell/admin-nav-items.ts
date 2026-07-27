import type { AdminRole } from "@wizards/db";
import { adminRoleHasCapability, type AdminCapability } from "@/lib/admin/capabilities";

export type AdminNavItem = {
  capability: AdminCapability;
  /** The route exists but still renders a placeholder — say so in the rail. */
  comingSoon?: boolean;
  href: string;
  /** Reserved for modules whose page really does stream live data. */
  live?: boolean;
  /** Matches the icon set already bundled with the app (lucide). */
  icon:
    | "gauge"
    | "users"
    | "server"
    | "activity"
    | "scroll"
    | "megaphone"
    | "flag"
    | "shield"
    | "pulse"
    | "toggle"
    | "chart"
    | "mic";
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
        capability: "dashboard.read",
        href: "/admin/analytics",
        icon: "chart",
        key: "analytics",
        label: "Analitik",
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
        capability: "case.read",
        href: "/admin/moderation",
        icon: "shield",
        key: "moderation",
        label: "Moderasyon",
      },
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
        href: "/admin/voice",
        icon: "mic",
        key: "voice",
        label: "Ses",
      },
      {
        capability: "health.read",
        href: "/admin/health",
        icon: "pulse",
        key: "health",
        label: "Platform Sağlığı",
      },
      {
        capability: "campaign.read",
        href: "/admin/notifications",
        icon: "megaphone",
        key: "notifications",
        label: "Bildirimler",
      },
      {
        capability: "flag.write",
        href: "/admin/flags",
        icon: "toggle",
        key: "flags",
        label: "Özellik Bayrakları",
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
