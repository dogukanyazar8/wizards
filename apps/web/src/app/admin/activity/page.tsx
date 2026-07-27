import { AdminModulePlaceholder } from "@/components/admin/shell/admin-module-placeholder";
import { requireAdminModule } from "@/lib/admin/module-access";

export default async function AdminActivityPage() {
  await requireAdminModule("dashboard.read");

  return (
    <AdminModulePlaceholder subtitle="Kullanım ve canlı platform sinyalleri" title="Aktivite" />
  );
}
