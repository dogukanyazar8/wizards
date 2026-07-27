import { AdminModulePlaceholder } from "@/components/admin/shell/admin-module-placeholder";
import { requireAdminCapability } from "@/lib/admin/capabilities";

export default async function AdminActivityPage() {
  await requireAdminCapability("dashboard.read");

  return (
    <AdminModulePlaceholder subtitle="Kullanım ve canlı platform sinyalleri" title="Aktivite" />
  );
}
