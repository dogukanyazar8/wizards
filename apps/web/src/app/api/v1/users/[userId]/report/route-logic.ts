import { MobileFriendUserParamsSchema, MobileUserReportRequestSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { createMobileUserReport } from "@/lib/social/mobile-user-profile-service";
import { submitUserReport, type CreateUserReport } from "@/lib/social/user-report-submission";

export type UserReportRouteContext = { params: Promise<Record<string, string>> };

/**
 * Karar K12 — §15.5's `Bildir` row, the web half of a door that only existed on
 * mobile until now.
 *
 * The body schema, the path-parameter schema and the whole submission path are
 * shared with `mobileUserReportRoute`; only the identity (a cookie session
 * rather than a bearer token) and the rate-limit bucket differ. A moderator
 * opening the queue cannot tell which client filed the case, which is the point:
 * the platform a report came from is not evidence.
 *
 * Reporting yourself is a 400 and a missing subject a 404, both raised inside
 * the shared service rather than guarded again here — a second copy of the
 * self-report check is a second thing that can be forgotten.
 */
export type UserReportRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  createReport: CreateUserReport;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
};

export async function userReportRoute(
  request: Request,
  context: UserReportRouteContext,
  dependencies: UserReportRouteDependencies,
): Promise<Response> {
  try {
    const reporterId = await dependencies.authenticate(request);
    // Narrow on purpose: a wide bucket here is a moderation queue full of noise,
    // and reporting is a deliberate act about one person, not a stream.
    await dependencies.enforceRateLimit(reporterId, "users:report");
    const [{ userId }, body] = await Promise.all([
      MobileFriendUserParamsSchema.parse(await context.params),
      parseJsonBody(request, MobileUserReportRequestSchema),
    ]);

    return Response.json(
      await submitUserReport({ body, reporterId, subjectId: userId }, dependencies.createReport),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export const userReportDefaults: UserReportRouteDependencies = {
  authenticate: () => requireApiUserId(),
  createReport: createMobileUserReport,
  enforceRateLimit: enforceApiRateLimit,
};
