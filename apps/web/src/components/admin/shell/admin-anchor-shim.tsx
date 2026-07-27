"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const LEGACY_ADMIN_HASH_ROUTES: Readonly<Record<string, string>> = {
  "#activity": "/admin/activity",
  "#audit": "/admin/audit",
  "#overview": "/admin",
  "#servers": "/admin/servers",
  "#users": "/admin/users",
};

/**
 * Remove after 2026-10-27, once links saved before the segmented admin routes
 * have had three months to migrate. URL fragments never reach the server.
 */
export function redirectLegacyAdminHash(hash: string, replace: (href: string) => void) {
  const destination = LEGACY_ADMIN_HASH_ROUTES[hash];

  if (!destination) {
    return false;
  }

  replace(destination);
  return true;
}

/** Client-only compatibility for legacy `/admin#users` style links. */
export function AdminAnchorShim() {
  const router = useRouter();

  useEffect(() => {
    redirectLegacyAdminHash(window.location.hash, (href) => router.replace(href));
  }, [router]);

  return null;
}
