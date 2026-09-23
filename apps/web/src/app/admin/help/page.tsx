import { AdminHelpArticles } from "@/components/admin/sections/admin-help-articles";
import { requireAdminModule } from "@/lib/admin/module-access";
import { listAdminHelpArticles } from "@/lib/help/admin-help-service";

export default async function AdminHelpPage() {
  await requireAdminModule("help.write");
  const [result] = await Promise.all([listAdminHelpArticles()]);

  return <AdminHelpArticles articles={result.articles} />;
}
