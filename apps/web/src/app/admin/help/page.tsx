import { AdminHelpArticles } from "@/components/admin/sections/admin-help-articles";
import { requireAdminModule } from "@/lib/admin/module-access";
import { listAdminHelpArticles } from "@/lib/help/admin-help-service";

export default async function AdminHelpPage() {
  const [, result] = await Promise.all([requireAdminModule("help.write"), listAdminHelpArticles()]);

  return <AdminHelpArticles articles={result.articles} />;
}
