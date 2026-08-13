import { notFound } from "next/navigation";
import { AdminCaseFile } from "@/components/admin/sections/admin-case-file";
import { adminRoleHasCapability } from "@/lib/admin/capabilities";
import { requireAdminModule } from "@/lib/admin/module-access";
import { getModerationCaseFile } from "@/lib/moderation/case-queries";

type AdminCaseFilePageProps = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pageNumber(value: string | string[] | undefined) {
  return Number(Array.isArray(value) ? value[0] : value);
}

export default async function AdminCaseFilePage({ params, searchParams }: AdminCaseFilePageProps) {
  const admin = await requireAdminModule("case.read");
  const { caseId } = await params;
  const query = await searchParams;
  const caseFile = await getModerationCaseFile(caseId, {
    evidencePage: pageNumber(query.evidencePage),
    eventPage: pageNumber(query.eventPage),
    reportPage: pageNumber(query.reportPage),
  });

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
