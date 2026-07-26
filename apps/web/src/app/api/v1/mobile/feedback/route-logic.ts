import {
  MobileFeedbackIdParamsSchema,
  MobileFeedbackSubmitRequestSchema,
  MobileRoadmapItemIdParamsSchema,
  MobileRoadmapVoteRequestSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  getMobileFeedbackDetail,
  listMobileRoadmap,
  setMobileRoadmapVote,
  submitMobileFeedback,
} from "@/lib/feedback/feedback-service";

type MobileFeedbackRateLimitAction =
  | "mobile:feedback:detail"
  | "mobile:feedback:roadmap"
  | "mobile:feedback:submit"
  | "mobile:feedback:vote";

export type MobileFeedbackRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileFeedbackRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: MobileFeedbackRateLimitAction): Promise<void>;
  getDetail: typeof getMobileFeedbackDetail;
  listRoadmap: typeof listMobileRoadmap;
  parseBody: typeof parseJsonBody;
  setVote: typeof setMobileRoadmapVote;
  submit: typeof submitMobileFeedback;
};

const defaultDependencies: MobileFeedbackRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  getDetail: getMobileFeedbackDetail,
  listRoadmap: listMobileRoadmap,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  setVote: setMobileRoadmapVote,
  submit: submitMobileFeedback,
};

/** Status, votes and "senin önerin" all move; nothing here may be cached. */
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function mobileFeedbackSubmitRoute(
  request: Request,
  dependencies: MobileFeedbackRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:feedback:submit");
    const input = await dependencies.parseBody(request, MobileFeedbackSubmitRequestSchema);
    const payload = await dependencies.submit(userId, input);

    return Response.json(payload, { headers: NO_STORE_HEADERS, status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

/** The tracking view a FEEDBACK notification opens. */
export async function mobileFeedbackDetailRoute(
  request: Request,
  context: MobileFeedbackRouteContext,
  dependencies: MobileFeedbackRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:feedback:detail");
    const { feedbackId } = MobileFeedbackIdParamsSchema.parse(await context.params);
    const payload = await dependencies.getDetail(userId, feedbackId);

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileRoadmapListRoute(
  request: Request,
  dependencies: MobileFeedbackRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:feedback:roadmap");
    const payload = await dependencies.listRoadmap(userId);

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileRoadmapVoteRoute(
  request: Request,
  context: MobileFeedbackRouteContext,
  dependencies: MobileFeedbackRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:feedback:vote");
    const { roadmapItemId } = MobileRoadmapItemIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, MobileRoadmapVoteRequestSchema);
    const payload = await dependencies.setVote(userId, roadmapItemId, input.voted);

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
