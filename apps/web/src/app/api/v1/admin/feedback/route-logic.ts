import type { AdminRole } from "@wizards/db";
import {
  AdminFeedbackUpdateRequestSchema,
  AdminRoadmapCreateRequestSchema,
  AdminRoadmapUpdateRequestSchema,
  FeedbackRatingSchema,
  FeedbackStatusSchema,
  FeedbackTopicSchema,
  MobileFeedbackIdParamsSchema,
  MobileRoadmapItemIdParamsSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireAdminUser, writeAdminAuditLog, type AdminAccessUser } from "@/lib/admin/access";
import {
  createAdminRoadmapItem,
  getAdminFeedbackDetail,
  listAdminFeedback,
  listAdminRoadmap,
  updateAdminFeedback,
  updateAdminRoadmapItem,
  type AdminFeedbackListFilters,
} from "@/lib/feedback/feedback-service";

/**
 * Reading feedback is a support job; changing a status or editing the public
 * roadmap is a product decision that reaches every user, so it stays with the
 * roles that already own destructive operations. `ANALYST` is read-only here
 * for the same reason it is read-only on the dashboard.
 */
const FEEDBACK_READ_ROLES: AdminRole[] = ["OWNER", "ADMIN", "SUPPORT", "ANALYST", "MODERATOR"];
const FEEDBACK_WRITE_ROLES: AdminRole[] = ["OWNER", "ADMIN", "SUPPORT"];

type AdminFeedbackRateLimitAction =
  "admin:feedback:list" | "admin:feedback:read" | "admin:feedback:update" | "admin:roadmap:update";

export type AdminFeedbackRouteContext = {
  params: Promise<Record<string, string>>;
};

export type AdminFeedbackRouteDependencies = {
  authenticateRead(): Promise<AdminAccessUser>;
  authenticateWrite(): Promise<AdminAccessUser>;
  createRoadmapItem: typeof createAdminRoadmapItem;
  enforceRateLimit(userId: string, action: AdminFeedbackRateLimitAction): Promise<void>;
  getDetail: typeof getAdminFeedbackDetail;
  list: typeof listAdminFeedback;
  listRoadmap: typeof listAdminRoadmap;
  parseBody: typeof parseJsonBody;
  updateFeedback: typeof updateAdminFeedback;
  updateRoadmapItem: typeof updateAdminRoadmapItem;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: AdminFeedbackRouteDependencies = {
  authenticateRead: () => requireAdminUser({ roles: FEEDBACK_READ_ROLES }),
  authenticateWrite: () => requireAdminUser({ roles: FEEDBACK_WRITE_ROLES }),
  createRoadmapItem: createAdminRoadmapItem,
  enforceRateLimit: enforceApiRateLimit,
  getDetail: getAdminFeedbackDetail,
  list: listAdminFeedback,
  listRoadmap: listAdminRoadmap,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  updateFeedback: updateAdminFeedback,
  updateRoadmapItem: updateAdminRoadmapItem,
  writeAuditLog: writeAdminAuditLog,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

function parseFilters(request: Request): AdminFeedbackListFilters {
  const params = new URL(request.url).searchParams;
  const status = FeedbackStatusSchema.safeParse(params.get("status"));
  const topic = FeedbackTopicSchema.safeParse(params.get("topic"));
  const rating = FeedbackRatingSchema.safeParse(params.get("rating"));

  return {
    cursor: params.get("cursor"),
    query: params.get("query"),
    rating: rating.success ? rating.data : "ALL",
    status: status.success ? status.data : "ALL",
    topic: topic.success ? topic.data : "ALL",
  };
}

export async function adminFeedbackListRoute(
  request: Request,
  dependencies: AdminFeedbackRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateRead();
    await dependencies.enforceRateLimit(admin.id, "admin:feedback:list");
    const payload = await dependencies.list(parseFilters(request));

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminFeedbackDetailRoute(
  _request: Request,
  context: AdminFeedbackRouteContext,
  dependencies: AdminFeedbackRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateRead();
    await dependencies.enforceRateLimit(admin.id, "admin:feedback:read");
    const { feedbackId } = MobileFeedbackIdParamsSchema.parse(await context.params);
    const payload = await dependencies.getDetail(feedbackId);

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminFeedbackUpdateRoute(
  request: Request,
  context: AdminFeedbackRouteContext,
  dependencies: AdminFeedbackRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:feedback:update");
    const { feedbackId } = MobileFeedbackIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, AdminFeedbackUpdateRequestSchema);
    const payload = await dependencies.updateFeedback(feedbackId, input);

    await dependencies.writeAuditLog({
      action: "admin.feedback.update",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: {
        ...(input.roadmapItemId === undefined ? {} : { roadmapItemId: input.roadmapItemId }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
      targetId: feedbackId,
      targetType: "Feedback",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminRoadmapListRoute(
  _request: Request,
  dependencies: AdminFeedbackRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateRead();
    await dependencies.enforceRateLimit(admin.id, "admin:feedback:list");
    const payload = await dependencies.listRoadmap();

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminRoadmapCreateRoute(
  request: Request,
  dependencies: AdminFeedbackRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:roadmap:update");
    const input = await dependencies.parseBody(request, AdminRoadmapCreateRequestSchema);
    const payload = await dependencies.createRoadmapItem(input);

    await dependencies.writeAuditLog({
      action: "admin.roadmap.create",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: { title: input.title },
      targetId: payload.item.id,
      targetType: "RoadmapItem",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS, status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminRoadmapUpdateRoute(
  request: Request,
  context: AdminFeedbackRouteContext,
  dependencies: AdminFeedbackRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:roadmap:update");
    const { roadmapItemId } = MobileRoadmapItemIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, AdminRoadmapUpdateRequestSchema);
    const payload = await dependencies.updateRoadmapItem(roadmapItemId, input);

    await dependencies.writeAuditLog({
      action: "admin.roadmap.update",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: { ...(input.status === undefined ? {} : { status: input.status }) },
      targetId: roadmapItemId,
      targetType: "RoadmapItem",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
