import { AdminFlags } from "@/components/admin/sections/admin-flags";
import { ADMIN_CAPABILITIES, adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";
import { listAdminFeatureFlags } from "@/lib/feature-flags/admin-service";

export default async function AdminFlagsPage() {
  const [admin, flags] = await Promise.all([
    requireAdminModule("flag.write"),
    listAdminFeatureFlags(),
  ]);

  return (
    <AdminFlags
      canWrite={adminRoleHasCapability(admin.role, "flag.write")}
      capabilities={Object.entries(ADMIN_CAPABILITIES).map(([capability, roles]) => ({
        capability,
        roles,
      }))}
      flags={flags}
    />
  );
}
