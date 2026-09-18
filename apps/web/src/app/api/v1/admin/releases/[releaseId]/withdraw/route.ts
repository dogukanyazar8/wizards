import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { writeAdminAuditLog } from "@/lib/admin/access";
import { AdminReleaseIdParamsSchema } from "@/lib/admin/content-schemas";
import { withdrawRelease } from "@/lib/releases/publication-service";

export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  try {
    const admin = await requireAdminCapability("release.write");
    await enforceApiRateLimit(admin.id, "admin:release:write");
    const { releaseId } = AdminReleaseIdParamsSchema.parse(await context.params);
    const result = await withdrawRelease(releaseId);
    await writeAdminAuditLog({
      action: "admin.release.withdraw",
      adminUserId: admin.id,
      headers: request.headers,
      targetId: releaseId,
      targetType: "Release",
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
