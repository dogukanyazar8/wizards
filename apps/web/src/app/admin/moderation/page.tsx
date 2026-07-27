import { AdminModerationQueue } from "@/components/admin/sections/admin-moderation-queue";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";
import {
  getModerationQueueStats,
  listModerationCases,
  type ModerationQueueScope,
} from "@/lib/moderation/case-queries";

type AdminModerationPageProps = {
  searchParams?: Promise<{ page?: string; scope?: string }>;
};

function normalizeScope(value: string | undefined): ModerationQueueScope {
  return value === "resolved" || value === "all" || value === "appealed" ? value : "active";
}

export default async function AdminModerationPage({ searchParams }: AdminModerationPageProps) {
  const params = await searchParams;
  const scope = normalizeScope(params?.scope);
  const page = Number.parseInt(params?.page ?? "1", 10);
  const now = new Date();
  const [admin, result, stats] = await Promise.all([
    requireAdminModule("case.read"),
    listModerationCases({ page: Number.isFinite(page) ? page : 1, scope }),
    getModerationQueueStats(now),
  ]);

  return (
    <AdminModerationQueue
      canAct={adminRoleHasCapability(admin.role, "case.action")}
      now={now}
      result={result}
      scope={scope}
      stats={stats}
    />
  );
}
