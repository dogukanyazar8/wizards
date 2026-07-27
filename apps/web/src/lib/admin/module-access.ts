import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { requireAdminCapability, type AdminCapability } from "@/lib/admin/capabilities";
import type { AdminAccessUser } from "@/lib/admin/access";

export type AdminModuleAccessDependencies = {
  redirect: (href: string) => never;
  requireAdminCapability: (capability: AdminCapability) => Promise<AdminAccessUser>;
};

const defaultAdminModuleAccessDependencies: AdminModuleAccessDependencies = {
  redirect,
  requireAdminCapability,
};

/**
 * Every admin role holds `dashboard.read`, so a refused module can always fall
 * back to the overview. The overview itself is the exception: sending it back to
 * `/admin` would loop, and the layout has already decided this session does not
 * belong in the console at all.
 */
function getFallbackPath(capability: AdminCapability) {
  return capability === "dashboard.read" ? "/channels" : "/admin";
}

/**
 * Page-level guard. Hiding a rail item is cosmetic — the page has to refuse the
 * role itself — but a refusal should land on a module the role can open instead
 * of the generic error boundary with its retry button.
 */
export async function requireAdminModule(
  capability: AdminCapability,
  dependencies: AdminModuleAccessDependencies = defaultAdminModuleAccessDependencies,
) {
  try {
    return await dependencies.requireAdminCapability(capability);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return dependencies.redirect(getFallbackPath(capability));
    }

    throw error;
  }
}
