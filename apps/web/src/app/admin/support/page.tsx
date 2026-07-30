import { AdminSupportReports } from "@/components/admin/sections/admin-support-reports";
import { requireAdminModule } from "@/lib/admin/module-access";
import { listAdminBugReports } from "@/lib/support/admin-support-service";

export default async function AdminSupportPage() {
  const [, result] = await Promise.all([requireAdminModule("support.read"), listAdminBugReports()]);

  return <AdminSupportReports reports={result.reports} />;
}
