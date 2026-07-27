import { notFound } from "next/navigation";
import { AdminCaseFile } from "@/components/admin/sections/admin-case-file";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";
import { getModerationCaseFile } from "@/lib/moderation/case-queries";

type AdminCaseFilePageProps = {
  params: Promise<{ caseId: string }>;
};

export default async function AdminCaseFilePage({ params }: AdminCaseFilePageProps) {
  const admin = await requireAdminModule("case.read");
  const { caseId } = await params;
  const caseFile = await getModerationCaseFile(caseId);

  if (!caseFile) {
    notFound();
  }

  return (
    <AdminCaseFile
      canAct={adminRoleHasCapability(admin.role, "case.action")}
      caseFile={caseFile}
      now={new Date()}
    />
  );
}
