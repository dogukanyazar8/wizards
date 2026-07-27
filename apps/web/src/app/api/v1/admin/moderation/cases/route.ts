import type { NextRequest } from "next/server";
import type { ModerationCasePriority, UserReportReason } from "@wizards/db";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { listModerationCases, type ModerationQueueScope } from "@/lib/moderation/case-queries";

const SCOPES = new Set<ModerationQueueScope>(["active", "all", "resolved"]);
const PRIORITIES = new Set<ModerationCasePriority>(["LOW", "NORMAL", "HIGH", "URGENT"]);
const REASONS = new Set<UserReportReason>([
  "HARASSMENT",
  "SPAM",
  "INAPPROPRIATE",
  "IMPERSONATION",
  "OTHER",
]);

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminCapability("case.read");
    await enforceApiRateLimit(admin.id, "admin:moderation:list");

    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const priority = url.searchParams.get("priority");
    const reason = url.searchParams.get("reason");
    const assigneeId = url.searchParams.get("assigneeId");
    const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);

    const payload = await listModerationCases({
      ...(assigneeId ? { assigneeId } : {}),
      page: Number.isFinite(page) ? page : 1,
      ...(priority && PRIORITIES.has(priority as ModerationCasePriority)
        ? { priority: priority as ModerationCasePriority }
        : {}),
      ...(reason && REASONS.has(reason as UserReportReason)
        ? { reason: reason as UserReportReason }
        : {}),
      ...(scope && SCOPES.has(scope as ModerationQueueScope)
        ? { scope: scope as ModerationQueueScope }
        : {}),
    });

    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}
