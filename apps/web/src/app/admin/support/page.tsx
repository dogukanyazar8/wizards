import { AdminSupportReports } from "@/components/admin/sections/admin-support-reports";
import { requireAdminModule } from "@/lib/admin/module-access";
import { listAdminBugReports } from "@/lib/support/admin-support-service";

export default async function AdminSupportPage() {
  await requireAdminModule("support.read");
  const [result] = await Promise.all([listAdminBugReports()]);

  return <AdminSupportReports reports={result.reports} />;
}
